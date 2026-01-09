import type { VercelRequest, VercelResponse } from '@vercel/node';

interface OrderStep {
  id: string;
  label: string;
  status: 'completed' | 'in_progress' | 'pending';
  clickable: boolean;
  url: string | null;
}

interface Order {
  order_number: string;
  order_id: string;
  current_status: string;
  url_link?: string;
  product_name?: string;
  financial_status?: string;
  fulfillment_status?: string;
  total_price?: string;
  created_at?: string;
  customer_email?: string;
  customer_name?: string;
  line_items?: any[];
  steps: OrderStep[];
}

interface OrderLinkData {
  url_upload: string;
  url_delivery: string;
  url_revision: string;
  current_status: string;
  product_name?: string;
  revision_number?: number;
}

// ===== MOCK DATA - FULL URLs FOR EACH STATUS =====
let orderLinks: { [key: string]: OrderLinkData } = {
  '#1003': {
    url_upload: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/upload',
    url_delivery: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/delivery',
    url_revision: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/delivery?revision={revisionNumber}',
    current_status: 'check_delivery',
    product_name: 'Residential 3D Rendering Service',
    revision_number: 1
  },
  '#1002': {
    url_upload: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/upload',
    url_delivery: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/delivery',
    url_revision: 'https://lookbook.bellavirtualstaging.com/projects?page=abc123-uuid-example/delivery?revision=1',
    current_status: 'upload_photo',
    product_name: 'Virtual Staging',
    revision_number: 1
  },
  '#1001': {
    url_upload: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/upload',
    url_delivery: 'https://lookbook.bellavirtualstaging.com/projects?page=xyz789-uuid-example/delivery',
    url_revision: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/delivery?revision={revisionNumber}',
    current_status: 'check_revision',
    product_name: 'Floor Plan Service',
    revision_number: 2
  }
};
// ===== END MOCK DATA =====

function generateSteps(
  currentStatus: string,
  urls: { upload: string; delivery: string; revision: string }
): OrderStep[] {
  const allSteps = [
    'upload_photo',
    'in_progress',
    'check_delivery', 
    'check_revision',
    'order_complete'
  ];

  const statusIndex = allSteps.indexOf(currentStatus);
  
  return [
    {
      id: 'upload_photo',
      label: 'Upload photo',
      status: statusIndex >= 0 ? 'completed' : 'pending',
      clickable: true,
      url: urls.upload  // Always has URL for testing
    },
    {
      id: 'in_progress',
      label: 'In progress',
      status: statusIndex === 1 ? 'in_progress' : (statusIndex > 1 ? 'completed' : 'pending'),
      clickable: false,
      url: null
    },
    {
      id: 'check_delivery',
      label: 'Check delivery',
      status: statusIndex === 2 ? 'in_progress' : (statusIndex > 2 ? 'completed' : 'pending'),
      clickable: true,
      url: urls.delivery  // Always has URL for testing
    },
    {
      id: 'check_revision',
      label: 'Check revision',
      status: statusIndex === 3 ? 'in_progress' : (statusIndex > 3 ? 'completed' : 'pending'),
      clickable: true,
      url: urls.revision  // Always has URL for testing
    },
    {
      id: 'order_complete',
      label: 'Order complete',
      status: statusIndex === 4 ? 'in_progress' : (statusIndex > 4 ? 'completed' : 'pending'),
      clickable: false,
      url: null
    }
  ];
}

// Helper function to fetch order from Shopify API
async function fetchShopifyOrder(orderNumber: string): Promise<any> {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    return null;
  }

  try {
    const orderName = orderNumber.replace('#', '');
    
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?name=${orderName}&status=any&limit=1`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('Shopify API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.orders && data.orders.length > 0) {
      return data.orders[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching from Shopify:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Retrieve order status
  if (req.method === 'GET') {
    const orderNumber = decodeURIComponent(req.query.order as string);
    
    if (!orderNumber) {
      return res.status(400).json({ 
        error: 'Order number is required',
        message: 'Please provide order parameter'
      });
    }

    try {
      // 1. Fetch from Shopify API
      const shopifyOrder = await fetchShopifyOrder(orderNumber);
      
      // 2. Get URL data from MOCK storage
      const linkData = orderLinks[orderNumber];
      
      if (!linkData) {
        return res.status(404).json({
          error: 'Order not found',
          message: `No mock data for order ${orderNumber}. Add it to orderLinks object.`
        });
      }
      
      let order: Order;
      
      if (shopifyOrder) {
        // Combine Shopify data with our URLs
        order = {
          order_number: shopifyOrder.name,
          order_id: shopifyOrder.id.toString(),
          current_status: linkData.current_status,
          url_link: linkData.url_delivery, // Main URL
          product_name: linkData.product_name || shopifyOrder.line_items?.[0]?.name,
          financial_status: shopifyOrder.financial_status,
          fulfillment_status: shopifyOrder.fulfillment_status,
          total_price: shopifyOrder.total_price,
          created_at: shopifyOrder.created_at,
          customer_email: shopifyOrder.email,
          customer_name: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim(),
          line_items: shopifyOrder.line_items,
          steps: []
        };
      } else {
        // Fallback if no Shopify data
        order = {
          order_number: orderNumber,
          order_id: orderNumber.replace('#', ''),
          current_status: linkData.current_status,
          url_link: linkData.url_delivery,
          product_name: linkData.product_name,
          steps: []
        };
      }

      // Generate steps with ALL URLs (for testing all buttons)
      order.steps = generateSteps(
        order.current_status,
        {
          upload: linkData.url_upload,
          delivery: linkData.url_delivery,
          revision: linkData.url_revision
        }
      );

      return res.status(200).json(order);
      
    } catch (error) {
      console.error('Error in GET handler:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST - Disabled in manual mode
  if (req.method === 'POST') {
    return res.status(200).json({
      success: true,
      message: 'POST disabled - Edit mock data in code to update orders'
    });
  }

  return res.status(405).json({ 
    error: 'Method not allowed',
    message: 'Only GET is supported in manual mode'
  });
}