import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    return res.status(500).json({ 
      error: 'Missing Shopify credentials',
      message: 'Please set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN in environment variables'
    });
  }

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Transform to our format
    const orders = data.orders.map((order: any) => ({
      order_number: order.name,
      order_id: order.admin_graphql_api_id || `gid://shopify/Order/${order.id}`,
      created_at: order.created_at,
      total_price: order.total_price,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      customer: {
        email: order.customer?.email || '',
        name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim()
      }
    }));

    return res.status(200).json({ 
      success: true,
      count: orders.length,
      orders 
    });

  } catch (error) {
    console.error('Shopify API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch orders',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}