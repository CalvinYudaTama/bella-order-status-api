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
}

// ===== IN-MEMORY STORAGE - Will be populated by Riley webhook =====
// ⚠️ WARNING: Data will be lost on Vercel instance restart
// For production, replace with database (PostgreSQL, MongoDB, etc.)
let orderLinks: { [key: string]: OrderLinkData } = {};
// ===== END STORAGE =====

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
      status: statusIndex === 0 ? 'in_progress' : (statusIndex > 0 ? 'completed' : 'pending'),
      clickable: true,
      url: urls.upload
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
      url: urls.delivery
    },
    {
      id: 'check_revision',
      label: 'Check revision',
      status: statusIndex === 3 ? 'in_progress' : (statusIndex > 3 ? 'completed' : 'pending'),
      clickable: true,
      url: urls.revision
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Retrieve order status (Called by Shopify frontend)
  if (req.method === 'GET') {
    const orderNumber = decodeURIComponent(req.query.order as string);
    
    if (!orderNumber) {
      return res.status(400).json({ 
        error: 'Order number is required',
        message: 'Please provide order parameter'
      });
    }

    try {
      const linkData = orderLinks[orderNumber];
      
      // Order not found - Riley hasn't pushed data yet
      if (!linkData) {
        return res.status(404).json({
          error: 'Order not found',
          message: `No tracking data available for order ${orderNumber}. Please wait for Riley to process this order.`,
          order_number: orderNumber
        });
      }
      
      // Optional: Fetch additional details from Shopify
      const shopifyOrder = await fetchShopifyOrder(orderNumber);
      
      let order: Order;
      
      if (shopifyOrder) {
        order = {
          order_number: shopifyOrder.name,
          order_id: shopifyOrder.id.toString(),
          current_status: linkData.current_status,
          url_link: linkData.url_delivery,
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
          order_number: orderNumber,
          order_id: orderNumber.replace('#', ''),
          current_status: linkData.current_status,
          url_link: linkData.url_delivery,
          product_name: linkData.product_name,
          steps: []
        };
      }

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

  // POST - Update order status (Called by Riley webhook)
  if (req.method === 'POST') {
    const { 
      order_number: rawOrderNumber, 
      current_status,
      url_link,
      product_name
    } = req.body;
    
    const order_number = rawOrderNumber ? decodeURIComponent(rawOrderNumber) : rawOrderNumber;

    // Validate required fields
    if (!order_number) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'order_number is required'
      });
    }

    try {
      // Create order entry if doesn't exist
      if (!orderLinks[order_number]) {
        console.log(`Creating new order entry: ${order_number}`);
        orderLinks[order_number] = {
          url_upload: '',
          url_delivery: '',
          url_revision: '',
          current_status: current_status || 'upload_photo',
          product_name: product_name
        };
      }

      // Update current_status
      if (current_status) {
        orderLinks[order_number].current_status = current_status;
        console.log(`Updated status for ${order_number}: ${current_status}`);
      }

      // Update product_name if provided
      if (product_name) {
        orderLinks[order_number].product_name = product_name;
      }

      // Update URL based on current_status
      if (url_link && current_status) {
        if (current_status === 'upload_photo') {
          orderLinks[order_number].url_upload = url_link;
          console.log(`Updated upload URL for ${order_number}`);
        } else if (current_status === 'check_delivery') {
          orderLinks[order_number].url_delivery = url_link;
          console.log(`Updated delivery URL for ${order_number}`);
        } else if (current_status === 'check_revision') {
          orderLinks[order_number].url_revision = url_link;
          console.log(`Updated revision URL for ${order_number}`);
        }
      }

      // Fetch Shopify order details (optional enrichment)
      const shopifyOrder = await fetchShopifyOrder(order_number);
      const linkData = orderLinks[order_number];

      // Determine which URL to use for url_link based on current_status
      let urlLinkForResponse: string;
      if (linkData.current_status === 'upload_photo') {
        urlLinkForResponse = linkData.url_upload;
      } else if (linkData.current_status === 'check_delivery') {
        urlLinkForResponse = linkData.url_delivery;
      } else if (linkData.current_status === 'check_revision') {
        urlLinkForResponse = linkData.url_revision;
      } else {
        urlLinkForResponse = linkData.url_delivery;
      }
      
      let order: Order;
      
      if (shopifyOrder) {
        order = {
          order_number: shopifyOrder.name,
          order_id: shopifyOrder.id.toString(),
          current_status: linkData.current_status,
          url_link: urlLinkForResponse,
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
          current_status: linkData.current_status,
          url_link: urlLinkForResponse,
          product_name: linkData.product_name,
          steps: []
        };
      }

      order.steps = generateSteps(
        order.current_status,
        {
          upload: linkData.url_upload,
          delivery: linkData.url_delivery,
          revision: linkData.url_revision
        }
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