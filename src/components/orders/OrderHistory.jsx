// components/orders/OrderHistory.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { ORANGE, NAVY, BORDER } from '../../config/constants';
import { Loading } from '../common/Loading';
import { SectionTitle } from '../common/SectionTitle';
import { FoodButton } from '../common/FoodButton';
import { StatusPill } from '../common/StatusPill';

export const OrderHistory = ({ setPage, user, setSelectedOrder }) => {
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: fetchedOrders, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          food_item_id,
          name,
          price,
          quantity,
          food_items (
            restaurant_id,
            image_url,
            restaurants (
              name,
              image_url
            )
          )
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching orders:", error);
      setGroupedOrders([]);
    } else {
      const groupedDisplayOrders = fetchedOrders.flatMap(order => {
        const restaurantGroups = order.order_items.reduce((acc, item) => {
          const restaurant = item.food_items?.restaurants;
          const restaurantId = restaurant?.name;

          if (!restaurantId) return acc;

          if (!acc[restaurantId]) {
            acc[restaurantId] = {
              restaurantName: restaurant.name,
              restaurantId: item.food_items.restaurant_id,
              items: [],
              subtotal: 0,
            };
          }

          const itemTotal = item.price * item.quantity;
          acc[restaurantId].items.push(item);
          acc[restaurantId].subtotal += itemTotal;
          return acc;
        }, {});

        return Object.values(restaurantGroups).map(group => ({
          ...order,
          displayId: `${order.id}-${group.restaurantId}`,
          restaurantName: group.restaurantName,
          order_items: group.items,
          total: group.subtotal,
          createdAt: new Date(order.created_at).toLocaleDateString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric'
          }),
          isSegment: true,
        }));
      });

      setGroupedOrders(groupedDisplayOrders);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [user, fetchOrders]);

  if (loading) return <Loading />;

  if (groupedOrders.length === 0) {
    return (
      <div className="p-4 md:p-6 text-center h-full flex flex-col justify-center items-center mx-auto w-full max-w-3xl">
        <span className='text-6xl mb-4'>😴</span>
        <h2 className="text-2xl font-bold mb-6" style={{ color: NAVY }}>No Orders Yet</h2>
        <p className='text-gray-500 mb-8'>Your food order history will appear here.</p>
        <div className='w-full max-w-sm'>
          <FoodButton onClick={() => setPage('products')}>Start Ordering!</FoodButton>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-3xl">
      <SectionTitle icon="🛵" title={`My Iligan Orders (${groupedOrders.length} Segments)`} />
      <div className="space-y-4">
        {groupedOrders.map(order => (
          <div 
            key={order.displayId} 
            className="bg-white p-4 rounded-xl shadow-md cursor-pointer transition-all duration-200 hover:shadow-lg hover:border"
            style={{ borderColor: ORANGE, border: '1px solid white' }}
            onClick={() => {
              setSelectedOrder(order);
              setPage('details');
            }}
          >
            {/* Header: Restaurant Name & Status */}
            <div className="flex justify-between items-start border-b pb-3 mb-3" style={{borderColor: BORDER}}>
              <div className="flex flex-col">
                <h3 className="font-bold text-lg text-gray-800 leading-tight">
                  {order.restaurantName}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-gray-500">#{order.id.slice(-6)} (Segment)</p> 
                  <span className="text-gray-300">•</span>
                  <p className="text-xs text-gray-500">{order.createdAt}</p>
                </div>
              </div>
              <StatusPill status={order.status} size="xs" />
            </div>

            {/* Food Items with images */}
            <div className="flex flex-wrap gap-2 mb-3">
              {order.order_items.map(item => (
                <div key={item.food_item_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  {item.food_items?.image_url && (
                    <img
                      src={item.food_items.image_url}
                      alt={item.name}
                      className="w-12 h-12 object-cover rounded-md"
                    />
                  )}
                  <div className="flex flex-col text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-gray-500">x{item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer: Item Count & Total */}
            <div className='flex justify-between items-center'>
              <p className='text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded-md'>
                {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
              </p>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-0.5">Subtotal</p>
                <p className="text-xl font-extrabold leading-none" style={{ color: ORANGE }}>
                  ₱{(order.total).toFixed(2)} 
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
