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
  steps: OrderStep[];
}

interface OrderLinkData {
  url_link?: string;
  product_name?: string;
  current_status?: string;
}

// Storage for url_link mappings only (not full orders)
// Real order data comes from Shopify API
let orderLinks: { [key: string]: OrderLinkData } = {
  '#1002': {
    url_link: 'https://lookbook.bellavirtualstaging.com/projects?page=2925b2fe-57d2-4736-a1fc-604f44b82a41/delivery',
    product_name: 'Virtual Staging',
    current_status: 'check_delivery'
  },
  '#1001': {
    url_link: 'https://lookbook.bellavirtualstaging.com/projects?page=2925b2fe-57d2-4736-a1fc-604f44b82a41/delivery?revision=1',
    product_name: 'Floor Plan Service',
    current_status: 'check_revision'
  }
};

function generateSteps(currentStatus: string, urlLink?: string): OrderStep[] {
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
      url: statusIndex >= 0 && urlLink ? urlLink : null
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
      url: statusIndex >= 2 && urlLink ? urlLink : null
    },
    {
      id: 'check_revision',
      label: 'Check revision',
      status: statusIndex === 3 ? 'in_progress' : (statusIndex > 3 ? 'completed' : 'pending'),
      clickable: true,
      url: statusIndex >= 3 && urlLink ? urlLink : null
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
    return null; // If no Shopify credentials, return null (will use fallback)
  }

  try {
    // Remove # from order number for Shopify API query
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

export default function handler(req: VercelRequest, res: VercelResponse) {
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
      // 1. Try to fetch from Shopify API
      const shopifyOrder = await fetchShopifyOrder(orderNumber);
      
      // 2. Get url_link data from our storage
      const linkData = orderLinks[orderNumber] || {};
      
      let order: Order;
      
      if (shopifyOrder) {
        // Case A: Order exists in Shopify - combine real data with url_link
        order = {
          order_number: shopifyOrder.name,
          order_id: shopifyOrder.id.toString(),
          current_status: linkData.current_status || 'upload_photo',
          url_link: linkData.url_link,
          product_name: linkData.product_name || shopifyOrder.line_items?.[0]?.name,
          financial_status: shopifyOrder.financial_status,
          fulfillment_status: shopifyOrder.fulfillment_status,
          total_price: shopifyOrder.total_price,
          created_at: shopifyOrder.created_at,
          steps: []
        };
      } else {
        // Case B: Order not found in Shopify (or no API access) - use fallback
        order = {
          order_number: orderNumber,
          order_id: orderNumber.replace('#', ''),
          current_status: linkData.current_status || 'upload_photo',
          url_link: linkData.url_link,
          product_name: linkData.product_name,
          steps: []
        };
      }

      // Generate steps based on current status
      order.steps = generateSteps(order.current_status, order.url_link);

      return res.status(200).json(order);
      
    } catch (error) {
      console.error('Error in GET handler:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST - Update order status / url_link
  if (req.method === 'POST') {
    const { order_number: rawOrderNumber, current_status, url_link, product_name } = req.body;
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

      // Update only the fields that are provided
      if (current_status) {
        orderLinks[order_number].current_status = current_status;
      }
      if (url_link) {
        orderLinks[order_number].url_link = url_link;
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
          url_link: linkData.url_link,
          product_name: linkData.product_name || shopifyOrder.line_items?.[0]?.name,
          financial_status: shopifyOrder.financial_status,
          fulfillment_status: shopifyOrder.fulfillment_status,
          total_price: shopifyOrder.total_price,
          created_at: shopifyOrder.created_at,
          steps: []
        };
      } else {
        order = {
          order_number: order_number,
          order_id: order_number.replace('#', ''),
          current_status: linkData.current_status || 'upload_photo',
          url_link: linkData.url_link,
          product_name: linkData.product_name,
          steps: []
        };
      }

      order.steps = generateSteps(order.current_status, order.url_link);

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