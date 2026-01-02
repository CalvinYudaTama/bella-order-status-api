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
  steps: OrderStep[];
  updated_at: string;
}

// Global variable - persists across requests in same serverless instance
const orderStore: { [key: string]: Order } = {};

// Initialize with default orders
if (Object.keys(orderStore).length === 0) {
  orderStore['#1003'] = {
    order_number: '#1003',
    order_id: '1003',
    current_status: 'in_progress',
    steps: [],
    updated_at: new Date().toISOString()
  };
  orderStore['#1002'] = {
    order_number: '#1002',
    order_id: '6660187521183',
    current_status: 'check_delivery',
    steps: [],
    updated_at: new Date().toISOString()
  };
  orderStore['#1001'] = {
    order_number: '#1001',
    order_id: '6659812294735',
    current_status: 'check_revision',
    steps: [],
    updated_at: new Date().toISOString()
  };
}

function generateSteps(currentStatus: string): OrderStep[] {
  const allSteps = [
    'upload_photo',
    'in_progress',
    'check_delivery', 
    'check_revision',
    'order_complete'
  ];

  const currentIndex = allSteps.indexOf(currentStatus);
  
  return allSteps.map((stepId, index) => {
    let status: 'completed' | 'in_progress' | 'pending';
    
    if (index < currentIndex) {
      status = 'completed';
    } else if (index === currentIndex) {
      status = 'in_progress';
    } else {
      status = 'pending';
    }

    const stepLabels: { [key: string]: string } = {
      'upload_photo': 'Upload photo',
      'in_progress': 'In progress',
      'check_delivery': 'Check delivery',
      'check_revision': 'Check revision',
      'order_complete': 'Order complete'
    };

    const clickableSteps = ['upload_photo', 'check_delivery', 'check_revision'];
    const isClickable = clickableSteps.includes(stepId);

    let url: string | null = null;
    if (isClickable && index <= currentIndex) {
      const urlMap: { [key: string]: string } = {
        'upload_photo': 'https://lookbook.bellavirtualstaging.com/upload',
        'check_delivery': 'https://lookbook.bellavirtualstaging.com/delivery',
        'check_revision': 'https://lookbook.bellavirtualstaging.com/revision'
      };
      url = urlMap[stepId] || null;
    }

    return {
      id: stepId,
      label: stepLabels[stepId] || stepId,
      status,
      clickable: isClickable,
      url
    };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Retrieve order status
  if (req.method === 'GET') {
    const orderNumber = req.query.order as string;
    
    if (!orderNumber) {
      return res.status(400).json({ 
        error: 'Order number is required',
        message: 'Please provide order parameter'
      });
    }

    let order = orderStore[orderNumber];
    
    // Auto-create order if doesn't exist
    if (!order) {
      order = {
        order_number: orderNumber,
        order_id: orderNumber.replace('#', ''),
        current_status: 'upload_photo',
        steps: [],
        updated_at: new Date().toISOString()
      };
      orderStore[orderNumber] = order;
    }

    // Generate fresh steps based on current status
    order.steps = generateSteps(order.current_status);

    console.log(`[GET] Order ${orderNumber} - Status: ${order.current_status}`);

    return res.status(200).json(order);
  }

  // POST - Update order status
  if (req.method === 'POST') {
    const { order_number, current_status } = req.body;

    if (!order_number || !current_status) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'order_number and current_status are required'
      });
    }

    // Validate status value
    const validStatuses = ['upload_photo', 'in_progress', 'check_delivery', 'check_revision', 'order_complete'];
    if (!validStatuses.includes(current_status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
        provided: current_status
      });
    }

    let order = orderStore[order_number];
    
    // Create or update order
    if (!order) {
      order = {
        order_number: order_number,
        order_id: order_number.replace('#', ''),
        current_status: current_status,
        steps: [],
        updated_at: new Date().toISOString()
      };
      orderStore[order_number] = order;
    } else {
      order.current_status = current_status;
      order.updated_at = new Date().toISOString();
    }

    // Generate steps with new status
    order.steps = generateSteps(order.current_status);

    console.log(`[POST] Order ${order_number} updated to: ${current_status}`);

    // Return the updated order immediately
    return res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order: order,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(405).json({ 
    error: 'Method not allowed',
    message: 'Only GET and POST methods are supported'
  });
}