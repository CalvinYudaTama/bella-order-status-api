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
  project_id?: string;
  revision_number?: number;
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
  project_id?: string;
  revision_number?: number;
  product_name?: string;
  current_status?: string;
}

// Clean storage - no mock data!
// Only stores: project_id, revision_number, current_status
let orderLinks: { [key: string]: OrderLinkData } = {};

// URL patterns for each status
const URL_PATTERNS = {
  upload_photo: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/upload',
  check_delivery: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/delivery',
  check_revision: 'https://lookbook.bellavirtualstaging.com/projects?page={projectId}/delivery?revision={revisionNumber}'
};

// Generate URL based on status and project_id
function generateUrlForStatus(
  status: string, 
  projectId?: string, 
  revisionNumber: number = 1
): string | null {
  if (!projectId) return null;
  
  const pattern = URL_PATTERNS[status as keyof typeof URL_PATTERNS];
  if (!pattern) return null;
  
  return pattern
    .replace('{projectId}', projectId)
    .replace('{revisionNumber}', revisionNumber.toString());
}

function generateSteps(
  currentStatus: string, 
  projectId?: string,
  revisionNumber: number = 1
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
      url: statusIndex >= 0 ? generateUrlForStatus('upload_photo', projectId) : null
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
      url: statusIndex >= 2 ? generateUrlForStatus('check_delivery', projectId) : null
    },
    {
      id: 'check_revision',
      label: 'Check revision',
      status: statusIndex === 3 ? 'in_progress' : (statusIndex > 3 ? 'completed' : 'pending'),
      clickable: true,
      url: statusIndex >= 3 ? generateUrlForStatus('check_revision', projectId, revisionNumber) : null
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
      
      // 2. Get project data from storage
      const linkData = orderLinks[orderNumber] || {};
      
      let order: Order;
      
      if (shopifyOrder) {
        // Combine Shopify data with our project_id
        order = {
          order_number: shopifyOrder.name,
          order_id: shopifyOrder.id.toString(),
          current_status: linkData.current_status || 'upload_photo',
          project_id: linkData.project_id,
          revision_number: linkData.revision_number || 1,
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
          current_status: linkData.current_status || 'upload_photo',
          project_id: linkData.project_id,
          revision_number: linkData.revision_number || 1,
          product_name: linkData.product_name,
          steps: []
        };
      }

      // Generate steps with dynamic URLs
      order.steps = generateSteps(
        order.current_status, 
        order.project_id,
        order.revision_number
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

  // POST - Update order status / project_id
  if (req.method === 'POST') {
    const { 
      order_number: rawOrderNumber, 
      current_status, 
      project_id,
      revision_number,
      product_name 
    } = req.body;
    
    const order_number = rawOrderNumber ? decodeURIComponent(rawOrderNumber) : rawOrderNumber;

    if (!order_number) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'order_number is required'
      });
    }

    try {
      // Initialize if doesn't exist
      if (!orderLinks[order_number]) {
        orderLinks[order_number] = {};
      }

      // Update fields
      if (current_status) {
        orderLinks[order_number].current_status = current_status;
      }
      if (project_id) {
        orderLinks[order_number].project_id = project_id;
      }
      if (revision_number !== undefined) {
        orderLinks[order_number].revision_number = revision_number;
      }
      if (product_name) {
        orderLinks[order_number].product_name = product_name;
      }

      // Fetch full order data for response
      const shopifyOrder = await fetchShopifyOrder(order_number);
      const linkData = orderLinks[order_number];

      let order: Order;
      
      if (shopifyOrder) {
        order = {
          order_number: shopifyOrder.name,
          order_id: shopifyOrder.id.toString(),
          current_status: linkData.current_status || 'upload_photo',
          project_id: linkData.project_id,
          revision_number: linkData.revision_number || 1,
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
        order = {
          order_number: order_number,
          order_id: order_number.replace('#', ''),
          current_status: linkData.current_status || 'upload_photo',
          project_id: linkData.project_id,
          revision_number: linkData.revision_number || 1,
          product_name: linkData.product_name,
          steps: []
        };
      }

      // Generate steps with dynamic URLs
      order.steps = generateSteps(
        order.current_status,
        order.project_id,
        order.revision_number
      );

      return res.status(200).json({
        success: true,
        message: 'Order status updated successfully',
        order: order
      });
      
    } catch (error) {
      console.error('Error in POST handler:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return res.status(405).json({ 
    error: 'Method not allowed',
    message: 'Only GET and POST methods are supported'
  });
}