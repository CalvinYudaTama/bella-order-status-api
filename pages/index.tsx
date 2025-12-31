import { useState, useEffect } from 'react';
import Head from 'next/head';

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
      const order1 = await fetch('/api/order-status?order=%231002').then(r => r.json());
      const order2 = await fetch('/api/order-status?order=%231001').then(r => r.json());
      setOrders([order1, order2]);
    } catch (error) {
      console.error('Error loading orders:', error);
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
      case 'completed': return 'text-green-400';
      case 'in_progress': return 'text-yellow-400';
      case 'pending': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const selectedOrderData = orders.find(o => o.order_number === selectedOrder);

  return (
    <>
      <Head>
        <title>Bella Order Status Dashboard</title>
        <meta name="description" content="Test dashboard for order status" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">
              Bella Order Status Dashboard
            </h1>
            <p className="text-gray-400">
              Simulate developer apps - Update order status in real-time
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">
                Update Order Status
              </h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Order
                </label>
                <select
                  value={selectedOrder}
                  onChange={(e) => {
                    setSelectedOrder(e.target.value);
                    const order = orders.find(o => o.order_number === e.target.value);
                    if (order) setSelectedStatus(order.current_status);
                  }}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Choose an order...</option>
                  {orders.map(order => (
                    <option key={order.order_number} value={order.order_number}>
                      {order.order_number} - Current: {order.current_status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  New Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={!selectedOrder}
                >
                  <option value="">Select status...</option>
                  <option value="upload_photo">Upload photo</option>
                  <option value="check_delivery">Check delivery</option>
                  <option value="check_revision">Check revision</option>
                  <option value="order_complete">Order complete</option>
                </select>
              </div>

              <button
                onClick={handleUpdateStatus}
                disabled={loading || !selectedOrder || !selectedStatus}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
              >
                {loading ? 'Updating...' : 'Update Status'}
              </button>

              {message && (
                <div className={`mt-4 p-4 rounded-lg ${
                  message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                }`}>
                  {message.text}
                </div>
              )}

              <div className="mt-8 p-4 bg-gray-900 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">API Endpoint</h3>
                <code className="text-xs text-purple-400 break-all">
                  POST /api/order-status
                </code>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">
                Order Details Preview
              </h2>

              {selectedOrderData ? (
                <div className="space-y-4">
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Order Number:</span>
                        <p className="text-white font-semibold">{selectedOrderData.order_number}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Current Status:</span>
                        <p className="text-purple-400 font-semibold">{selectedOrderData.current_status}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-900 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4">Status Steps</h3>
                    <div className="space-y-3">
                      {selectedOrderData.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            step.status === 'in_progress' ? 'bg-yellow-900/20 border border-yellow-700' : 'bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${
                              step.status === 'completed' ? 'bg-green-400' :
                              step.status === 'in_progress' ? 'bg-yellow-400' : 'bg-gray-600'
                            }`}></span>
                            <span className={`font-medium ${getStatusColor(step.status)}`}>
                              {step.label}
                            </span>
                          </div>
                          {step.clickable && (
                            <span className="text-xs text-purple-400">🔗 Clickable</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-900 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-400 mb-3">Shopify Tooltip Preview</h3>
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      {selectedOrderData.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`py-2 px-3 ${getStatusColor(step.status)} ${
                            step.clickable ? 'hover:bg-gray-700 cursor-pointer' : ''
                          }`}
                        >
                          {step.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  <p>Select an order to view details</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 max-w-6xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
              <h2 className="text-2xl font-semibold text-white mb-6">All Orders</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Order #</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Order ID</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Current Status</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => {
                      const completed = order.steps.filter(s => s.status === 'completed').length;
                      const total = order.steps.length;
                      const percentage = Math.round((completed / total) * 100);

                      return (
                        <tr key={order.order_number} className="border-b border-gray-700 hover:bg-gray-700/50">
                          <td className="py-4 px-4 text-white font-semibold">{order.order_number}</td>
                          <td className="py-4 px-4 text-gray-400 text-sm font-mono">{order.order_id.slice(0, 8)}...</td>
                          <td className="py-4 px-4">
                            <span className="px-3 py-1 bg-purple-900/50 text-purple-300 rounded-full text-sm">
                              {order.current_status}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-700 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-400">{percentage}%</span>
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
    </>
  );
}