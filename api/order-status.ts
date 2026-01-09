import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

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
  url_link?: string;
  product_name?: string;
  current_status?: string;
}

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

async function fetchShopifyOrder(orderNumber: string): Promise<any> {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    console.error('Missing Shopify credentials');
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

async function fetchAllShopifyOrders(limit: number = 250): Promise<any[]> {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    console.error('Missing Shopify credentials');
    return [];
  }

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&limit=${limit}`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('Shopify API error:', response.status);
      return [];
    }

    const data = await response.json();
    return data.orders || [];
    
  } catch (error) {
    console.error('Error fetching all orders from Shopify:', error);
    return [];
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

  if (req.method === 'GET') {
    const orderNumber = req.query.order as string;
    const action = req.query.action as string;

    if (action === 'get_all_orders') {
      try {
        const shopifyOrders = await fetchAllShopifyOrders();
        
        const ordersWithLinks = await Promise.all(
          shopifyOrders.map(async (shopifyOrder) => {
            const orderNum = shopifyOrder.name;
            
            let linkData: OrderLinkData = {};
            try {
              linkData = await kv.get<OrderLinkData>(`order:${orderNum}`) || {};
            } catch (error) {
              console.error('KV error, using empty data:', error);
            }
            
            return {
              order_number: shopifyOrder.name,
              order_id: shopifyOrder.id.toString(),
              current_status: linkData.current_status || 'upload_photo',
              url_link: linkData.url_link,
              product_name: linkData.product_name || shopifyOrder.line_items?.[0]?.name,
              financial_status: shopifyOrder.financial_status,
              fulfillment_status: shopifyOrder.fulfillment_status,
              total_price: shopifyOrder.total_price,
              created_at: shopifyOrder.created_at,
              customer_email: shopifyOrder.customer?.email,
              customer_name: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim(),
              line_items: shopifyOrder.line_items,
              steps: generateSteps(linkData.current_status || 'upload_photo', linkData.url_link)
            };
          })
        );

        return res.status(200).json({
          success: true,
          count: ordersWithLinks.length,
          orders: ordersWithLinks
        });
        
      } catch (error) {
        console.error('Error fetching all orders:', error);
        return res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    if (!orderNumber) {
      return res.status(400).json({ 
        error: 'Order number is required',
        message: 'Please provide order parameter or action=get_all_orders'
      });
    }

    try {
      const shopifyOrder = await fetchShopifyOrder(orderNumber);
      
      if (!shopifyOrder) {
        return res.status(404).json({
          error: 'Order not found',
          message: `Order ${orderNumber} not found in Shopify`
        });
      }

      let linkData: OrderLinkData = {};
      try {
        linkData = await kv.get<OrderLinkData>(`order:${orderNumber}`) || {};
      } catch (error) {
        console.error('KV error, using empty data:', error);
      }
      
      const order: Order = {
        order_number: shopifyOrder.name,
        order_id: shopifyOrder.id.toString(),
        current_status: linkData.current_status || 'upload_photo',
        url_link: linkData.url_link,
        product_name: linkData.product_name || shopifyOrder.line_items?.[0]?.name,
        financial_status: shopifyOrder.financial_status,
        fulfillment_status: shopifyOrder.fulfillment_status,
        total_price: shopifyOrder.total_price,
        created_at: shopifyOrder.created_at,
        customer_email: shopifyOrder.customer?.email,
        customer_name: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim(),
        line_items: shopifyOrder.line_items,
        steps: []
      };

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

  if (req.method === 'POST') {
    const { order_number, current_status, url_link, product_name } = req.body;

    if (!order_number) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'order_number is required'
      });
    }

    try {
      const shopifyOrder = await fetchShopifyOrder(order_number);
      
      if (!shopifyOrder) {
        return res.status(404).json({
          error: 'Order not found',
          message: `Order ${order_number} not found in Shopify`
        });
      }

      let linkData: OrderLinkData = {};
      try {
        linkData = await kv.get<OrderLinkData>(`order:${order_number}`) || {};
      } catch (error) {
        console.error('KV error, using empty data:', error);
      }

      if (current_status) linkData.current_status = current_status;
      if (url_link) linkData.url_link = url_link;
      if (product_name) linkData.product_name = product_name;

      try {
        await kv.set(`order:${order_number}`, linkData);
      } catch (error) {
        console.error('KV save error:', error);
      }

      const order: Order = {
        order_number: shopifyOrder.name,
        order_id: shopifyOrder.id.toString(),
        current_status: linkData.current_status || 'upload_photo',
        url_link: linkData.url_link,
        product_name: linkData.product_name || shopifyOrder.line_items?.[0]?.name,
        financial_status: shopifyOrder.financial_status,
        fulfillment_status: shopifyOrder.fulfillment_status,
        total_price: shopifyOrder.total_price,
        created_at: shopifyOrder.created_at,
        customer_email: shopifyOrder.customer?.email,
        customer_name: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim(),
        line_items: shopifyOrder.line_items,
        steps: []
      };

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