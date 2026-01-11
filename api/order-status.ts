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

// ===== IN-MEMORY STORAGE =====
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

async function addShopifyOrderTag(
  orderNumber: string, 
  tag: string
): Promise<boolean> {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    console.warn('Shopify credentials not configured for tagging');
    return false;
  }

  try {
    console.log(`[SHOPIFY TAG] Starting tag process for order ${orderNumber}`);
    
    // Find the order
    const order = await fetchShopifyOrder(orderNumber);
    
    if (!order) {
      console.warn(`[SHOPIFY TAG] Order ${orderNumber} not found in Shopify`);
      return false;
    }

    console.log(`[SHOPIFY TAG] Found order ID: ${order.id}`);
    
    // Get existing tags
    const existingTags = order.tags ? order.tags.split(', ').map(t => t.trim()) : [];
    console.log(`[SHOPIFY TAG] Existing tags:`, existingTags);
    
    // Check if tag already exists
    if (existingTags.includes(tag)) {
      console.log(`[SHOPIFY TAG] Tag "${tag}" already exists on order ${orderNumber}`);
      return true;
    }
    
    // Add new tag
    existingTags.push(tag);
    const newTags = existingTags.join(', ');
    
    console.log(`[SHOPIFY TAG] New tags string:`, newTags);
    
    // Update order with new tag
    const updateResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/orders/${order.id}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: order.id,
            tags: newTags
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[SHOPIFY TAG] Failed to update order: ${updateResponse.status}`, errorText);
      return false;
    }

    console.log(`[SHOPIFY TAG] ✅ Successfully added tag "${tag}" to order ${orderNumber}`);
    console.log(`[SHOPIFY TAG] 🔔 Shopify Flow should be triggered now!`);
    return true;

  } catch (error) {
    console.error('[SHOPIFY TAG] Error adding tag:', error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      
      if (!linkData) {
        return res.status(404).json({
          error: 'Order not found',
          message: `No tracking data available for order ${orderNumber}. Please wait for Riley to process this order.`,
          order_number: orderNumber
        });
      }
      
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
      url,          // Riley sends this
      url_link,     // Backward compatibility
      product_name
    } = req.body;
    
    // Handle order number formatting
    let order_number = rawOrderNumber ? decodeURIComponent(rawOrderNumber) : rawOrderNumber;
    
    // Auto-add # if not present (Riley sends "1002" not "#1002")
    if (order_number && !order_number.startsWith('#')) {
      order_number = '#' + order_number;
    }

    if (!order_number) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'order_number is required'
      });
    }

    try {
      console.log(`\n========================================`);
      console.log(`[POST] Received webhook from Riley`);
      console.log(`[POST] Raw order_number: ${rawOrderNumber}`);
      console.log(`[POST] Processed order_number: ${order_number}`);
      console.log(`[POST] Status: ${current_status}`);
      console.log(`[POST] URL field: ${url ? 'url' : url_link ? 'url_link' : 'none'}`);
      console.log(`[POST] URL value: ${url || url_link || 'N/A'}`);
      console.log(`========================================\n`);

      // Use url or url_link (Riley compatibility)
      const linkUrl = url || url_link;

      // Create or update order entry
      if (!orderLinks[order_number]) {
        console.log(`[POST] Creating new order entry: ${order_number}`);
        orderLinks[order_number] = {
          url_upload: '',
          url_delivery: '',
          url_revision: '',
          current_status: current_status || 'upload_photo',
          product_name: product_name
        };
      }

      // Update status
      if (current_status) {
        orderLinks[order_number].current_status = current_status;
        console.log(`[POST] ✅ Updated status to: ${current_status}`);
      }

      // Update product name
      if (product_name) {
        orderLinks[order_number].product_name = product_name;
        console.log(`[POST] ✅ Updated product name: ${product_name}`);
      }

      // Update URL based on status
      if (linkUrl && current_status) {
        if (current_status === 'upload_photo') {
          orderLinks[order_number].url_upload = linkUrl;
          console.log(`[POST] ✅ Updated upload URL`);
        } else if (current_status === 'check_delivery') {
          orderLinks[order_number].url_delivery = linkUrl;
          console.log(`[POST] ✅ Updated delivery URL`);
        } else if (current_status === 'check_revision') {
          orderLinks[order_number].url_revision = linkUrl;
          console.log(`[POST] ✅ Updated revision URL`);
        }
      }

      // ===== TRIGGER SHOPIFY FLOW WHEN ORDER COMPLETE =====
      if (current_status === 'order_complete') {
        console.log(`\n🎯 [FLOW TRIGGER] Order ${order_number} is COMPLETE!`);
        console.log(`🎯 [FLOW TRIGGER] Attempting to add Shopify tag...`);
        
        const tagSuccess = await addShopifyOrderTag(order_number, 'bella-order-complete');
        
        if (tagSuccess) {
          console.log(`✅ [FLOW TRIGGER] SUCCESS! Tag added to Shopify order`);
          console.log(`✅ [FLOW TRIGGER] Shopify Flow should trigger email now`);
          console.log(`✅ [FLOW TRIGGER] Customer will receive completion email\n`);
        } else {
          console.warn(`⚠️ [FLOW TRIGGER] FAILED to add tag`);
          console.warn(`⚠️ [FLOW TRIGGER] Shopify Flow will NOT trigger`);
          console.warn(`⚠️ [FLOW TRIGGER] Check Shopify credentials and order number\n`);
        }
      }

      // Build response
      const shopifyOrder = await fetchShopifyOrder(order_number);
      const linkData = orderLinks[order_number];

      // Determine which URL to return based on current status
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

      console.log(`[POST] ✅ Order ${order_number} webhook processed successfully\n`);

      return res.status(200).json({
        success: true,
        message: 'Order status updated successfully',
        shopify_tag_added: current_status === 'order_complete',
        order: order
      });
      
    } catch (error) {
      console.error('[POST] ❌ Error processing webhook:', error);
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