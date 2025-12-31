import type { VercelRequest, VercelResponse } from '@vercel/node';

interface OrderStep {
  id: string;
  label: string;
  status: 'completed' | 'in_progress' | 'pending';
  clickable: boolean;
  url: string | null;
}

interface OrderStatus {
  order_number: string;
  order_id: string;
  current_status: string;
  steps: OrderStep[];
}

// Mock database (in-memory untuk test)
const mockDatabase: Record<string, OrderStatus> = {
  "#1002": {
    order_number: "#1002",
    order_id: "472c2c0c-f4e4-48d4-b031-e447ffe3cdc5",
    current_status: "check_delivery",
    steps: [
      {
        id: "upload_photo",
        label: "Upload photo",
        status: "completed",
        clickable: true,
        url: "https://lookbook.bellavirtualstaging.com/projects/472c2c0c-f4e4-48d4-b031-e447ffe3cdc5/upload"
      },
      {
        id: "in_progress_1",
        label: "In progress",
        status: "completed",
        clickable: false,
        url: null
      },
      {
        id: "check_delivery",
        label: "Check delivery",
        status: "in_progress",
        clickable: true,
        url: "https://lookbook.bellavirtualstaging.com/projects/472c2c0c-f4e4-48d4-b031-e447ffe3cdc5/delivery&revision=1"
      },
      {
        id: "in_progress_2",
        label: "In progress",
        status: "pending",
        clickable: false,
        url: null
      },
      {
        id: "check_revision",
        label: "Check revision",
        status: "pending",
        clickable: true,
        url: "https://lookbook.bellavirtualstaging.com/projects/472c2c0c-f4e4-48d4-b031-e447ffe3cdc5/revision&revision=2"
      },
      {
        id: "order_complete",
        label: "Order complete",
        status: "pending",
        clickable: false,
        url: null
      }
    ]
  },
  "#1001": {
    order_number: "#1001",
    order_id: "8a3f5d2e-c9b1-4a7e-9d6f-1e2c3b4a5d6e",
    current_status: "check_revision",
    steps: [
      {
        id: "upload_photo",
        label: "Upload photo",
        status: "completed",
        clickable: true,
        url: "https://lookbook.bellavirtualstaging.com/projects/8a3f5d2e-c9b1-4a7e-9d6f-1e2c3b4a5d6e/upload"
      },
      {
        id: "in_progress_1",
        label: "In progress",
        status: "completed",
        clickable: false,
        url: null
      },
      {
        id: "check_delivery",
        label: "Check delivery",
        status: "completed",
        clickable: true,
        url: "https://lookbook.bellavirtualstaging.com/projects/8a3f5d2e-c9b1-4a7e-9d6f-1e2c3b4a5d6e/delivery&revision=1"
      },
      {
        id: "in_progress_2",
        label: "In progress",
        status: "completed",
        clickable: false,
        url: null
      },
      {
        id: "check_revision",
        label: "Check revision",
        status: "in_progress",
        clickable: true,
        url: "https://lookbook.bellavirtualstaging.com/projects/8a3f5d2e-c9b1-4a7e-9d6f-1e2c3b4a5d6e/revision&revision=2"
      },
      {
        id: "order_complete",
        label: "Order complete",
        status: "pending",
        clickable: false,
        url: null
      }
    ]
  }
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET request - fetch order status
  if (req.method === 'GET') {
    const { order } = req.query;

    if (!order || typeof order !== 'string') {
      return res.status(400).json({
        error: 'Order number is required',
        message: 'Please provide order number in query parameter'
      });
    }

    const orderStatus = mockDatabase[order];

    if (!orderStatus) {
      return res.status(404).json({
        error: 'Order not found',
        message: `Order ${order} does not exist in our system`
      });
    }

    // Simulate network delay (optional)
    await new Promise(resolve => setTimeout(resolve, 500));

    return res.status(200).json(orderStatus);
  }

  // POST request - update order status (untuk admin panel)
  if (req.method === 'POST') {
    const { order_number, current_status } = req.body;

    if (!order_number || !current_status) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'order_number and current_status are required'
      });
    }

    // Update mock database
    if (mockDatabase[order_number]) {
      mockDatabase[order_number].current_status = current_status;
      
      // Update steps based on new status
      const stepOrder = ['upload_photo', 'in_progress_1', 'check_delivery', 'in_progress_2', 'check_revision', 'order_complete'];
      const currentIndex = stepOrder.findIndex(s => s === current_status);
      
      mockDatabase[order_number].steps.forEach((step) => {
        const stepIndex = stepOrder.indexOf(step.id);
        if (stepIndex < currentIndex) {
          step.status = 'completed';
        } else if (stepIndex === currentIndex) {
          step.status = 'in_progress';
        } else {
          step.status = 'pending';
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Order status updated',
        data: mockDatabase[order_number]
      });
    }

    return res.status(404).json({
      error: 'Order not found',
      message: `Order ${order_number} does not exist`
    });
  }

  return res.status(405).json({
    error: 'Method not allowed',
    message: 'Only GET and POST methods are supported'
  });
}