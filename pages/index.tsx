import { useState, useEffect } from 'react';

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

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      // Try to fetch from Shopify first
      const shopifyResponse = await fetch('/api/shopify-orders');
      
      if (shopifyResponse.ok) {
        const shopifyData = await shopifyResponse.json();
        
        if (shopifyData.success && shopifyData.orders.length > 0) {
          // Fetch status for each order (limit to first 10)
          const ordersWithStatus = await Promise.all(
            shopifyData.orders.slice(0, 10).map(async (shopifyOrder: any) => {
              try {
                const statusResponse = await fetch(`/api/order-status?order=${encodeURIComponent(shopifyOrder.order_number)}`);
                
                if (statusResponse.ok) {
                  return await statusResponse.json();
                } else {
                  // Create default order if not found
                  return {
                    order_number: shopifyOrder.order_number,
                    order_id: shopifyOrder.order_id,
                    current_status: 'upload_photo',
                    steps: []
                  };
                }
              } catch (error) {
                // Fallback to default
                return {
                  order_number: shopifyOrder.order_number,
                  order_id: shopifyOrder.order_id,
                  current_status: 'upload_photo',
                  steps: []
                };
              }
            })
          );
          
          setOrders(ordersWithStatus);
          return;
        }
      }
      
      // Fallback to mock data
      const order1 = await fetch('/api/order-status?order=%231002').then(r => r.json());
      const order2 = await fetch('/api/order-status?order=%231001').then(r => r.json());
      setOrders([order1, order2]);
      
    } catch (error) {
      console.error('Error loading orders:', error);
      // Ultimate fallback to mock data
      const order1 = await fetch('/api/order-status?order=%231002').then(r => r.json());
      const order2 = await fetch('/api/order-status?order=%231001').then(r => r.json());
      setOrders([order1, order2]);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder || !selectedStatus) {
      setMessage({ type: 'error', text: 'Please select order and status' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: selectedOrder,
          current_status: selectedStatus
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Status updated successfully!' });
        await loadOrders();
      } else {
        setMessage({ type: 'error', text: data.message || 'Update failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'in_progress': return 'text-blue-600';
      case 'pending': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-50 border-green-200';
      case 'in_progress': return 'bg-blue-50 border-blue-200';
      case 'pending': return 'bg-gray-50 border-gray-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const selectedOrderData = orders.find(o => o.order_number === selectedOrder);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">B</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Bella Order Status Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Manage order status - Auto-sync with Shopify
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {/* Left Panel - Update Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Update Order Status
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Order
                </label>
                <select
                  value={selectedOrder}
                  onChange={(e) => {
                    setSelectedOrder(e.target.value);
                    const order = orders.find(o => o.order_number === e.target.value);
                    if (order) setSelectedStatus(order.current_status);
                  }}
                  className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="">Choose an order...</option>
                  {orders.map(order => (
                    <option key={order.order_number} value={order.order_number}>
                      {order.order_number} - Current: {order.current_status.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={!selectedOrder}
                >
                  <option value="">Select status...</option>
                  <option value="upload_photo">Upload photo</option>
                  <option value="in_progress">In progress</option>
                  <option value="check_delivery">Check delivery</option>
                  <option value="check_revision">Check revision</option>
                  <option value="order_complete">Order complete</option>
                </select>
              </div>

              <button
                onClick={handleUpdateStatus}
                disabled={loading || !selectedOrder || !selectedStatus}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {loading ? 'Updating...' : 'Update Status'}
              </button>

              {message && (
                <div className={`p-4 rounded-lg border ${
                  message.type === 'success' 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <p className="text-sm font-medium">{message.text}</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  API Endpoints
                </h3>
                <div className="space-y-1">
                  <code className="text-xs text-blue-600 break-all font-mono block">
                    POST /api/order-status
                  </code>
                  <code className="text-xs text-green-600 break-all font-mono block">
                    GET /api/shopify-orders
                  </code>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Order Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Order Details Preview
            </h2>

            {selectedOrderData ? (
              <div className="space-y-6">
                {/* Order Info */}
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Order Number</span>
                      <p className="text-lg font-bold text-gray-900 mt-1">{selectedOrderData.order_number}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Current Status</span>
                      <p className="text-lg font-bold text-blue-600 mt-1">{selectedOrderData.current_status.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                </div>

                {/* Status Steps */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Status Steps</h3>
                  <div className="space-y-2">
                    {selectedOrderData.steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${getStatusBgColor(step.status)}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            step.status === 'completed' ? 'bg-green-500' :
                            step.status === 'in_progress' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                          }`}></span>
                          <span className={`font-medium ${getStatusColor(step.status)}`}>
                            {step.label}
                          </span>
                        </div>
                        {step.clickable && (
                          <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Clickable
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shopify Preview */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Shopify Customer View</h3>
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                    <div className="space-y-2">
                      {selectedOrderData.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`py-2 px-3 rounded transition-colors ${
                            step.clickable ? 'hover:bg-gray-800 cursor-pointer' : ''
                          } ${getStatusColor(step.status)}`}
                        >
                          {step.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">Select an order to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* All Orders Table */}
        <div className="mt-6 max-w-7xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">All Orders ({orders.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Order #</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Order ID</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Current Status</th>
                    <th className="text-left py-3 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map(order => {
                    const completed = order.steps.filter(s => s.status === 'completed').length;
                    const total = order.steps.length;
                    const percentage = Math.round((completed / total) * 100);

                    return (
                      <tr key={order.order_number} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6 text-sm font-semibold text-gray-900">{order.order_number}</td>
                        <td className="py-4 px-6 text-sm text-gray-600 font-mono">{order.order_id.slice(0, 20)}...</td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {order.current_status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-xs">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-gray-700 min-w-[45px]">{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}