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
}

// Mock database - auto-creates missing orders
let orders: { [key: string]: Order } = {
  '#1002': {
    order_number: '#1002',
    order_id: '6660187521183',
    current_status: 'check_delivery',
    steps: []
  },
  '#1001': {
    order_number: '#1001',
    order_id: '6659812294735',
    current_status: 'check_revision',
    steps: []
  }
};

function generateSteps(currentStatus: string): OrderStep[] {
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
      url: statusIndex >= 0 ? 'https://lookbook.bellavirtualstaging.com/upload' : null
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
      url: statusIndex >= 2 ? 'https://lookbook.bellavirtualstaging.com/delivery' : null
    },
    {
      id: 'check_revision',
      label: 'Check revision',
      status: statusIndex === 3 ? 'in_progress' : (statusIndex > 3 ? 'completed' : 'pending'),
      clickable: true,
      url: statusIndex >= 3 ? 'https://lookbook.bellavirtualstaging.com/revision' : null
    },
    {
      id: 'order_complete',
      label: 'Order complete',
      status: statusIndex === 4 ? 'completed' : 'pending',
      clickable: false,
      url: null
    }
  ];
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
    const orderNumber = req.query.order as string;
    
    if (!orderNumber) {
      return res.status(400).json({ 
        error: 'Order number is required',
        message: 'Please provide order parameter'
      });
    }

    let order = orders[orderNumber];
    
    // Auto-create order if doesn't exist
    if (!order) {
      order = {
        order_number: orderNumber,
        order_id: orderNumber.replace('#', ''),
        current_status: 'upload_photo',
        steps: []
      };
      orders[orderNumber] = order;
    }

    // Generate steps based on current status
    order.steps = generateSteps(order.current_status);

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
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    let order = orders[order_number];
    
    // Auto-create order if doesn't exist
    if (!order) {
      order = {
        order_number: order_number,
        order_id: order_number.replace('#', ''),
        current_status: current_status,
        steps: []
      };
      orders[order_number] = order;
    } else {
      // Update existing order
      order.current_status = current_status;
    }

    // Generate steps based on updated status
    order.steps = generateSteps(order.current_status);

    return res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      order: order
    });
  }

  return res.status(405).json({ 
    error: 'Method not allowed',
    message: 'Only GET and POST methods are supported'
  });
}