// components/checkout/Checkout.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../config/supabase";
import { ORANGE, NAVY, BORDER, ORDER_STATUSES } from "../../config/constants";
import { SectionTitle } from "../common/SectionTitle";
import { FoodButton } from "../common/FoodButton";
import { StyledInput } from "../common/StyledInput";
import { AddressMapPreview } from "./AddressMapPreview";

export const Checkout = ({ setPage, cart, setCart, user }) => {
  const [address, setAddress] = useState({
    name: "",
    phone: "",
    addressDetail: "",
    barangay: "",
    payment: "COD",
  });

  const [barangays, setBarangays] = useState([]);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [coords, setCoords] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [estimatedEtaMin, setEstimatedEtaMin] = useState(null);
  const [inDeliveryArea, setInDeliveryArea] = useState(true);
  const [nearestRestaurant, setNearestRestaurant] = useState(null);

  const totalGoods = useMemo(() => cart.reduce((s, it) => s + it.price * it.quantity, 0), [cart]);

  // fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: zonesData } = await supabase
          .from("delivery_zones")
          .select("barangay_name, polygon_points, is_active")
          .eq("is_active", true);

        if (zonesData) {
          setDeliveryZones(zonesData);
          const brs = zonesData.map(z => z.barangay_name).filter(Boolean);
          setBarangays(brs);
          if (brs.length > 0 && !address.barangay) setAddress(prev => ({ ...prev, barangay: brs[0] }));
        }

        const { data: restData } = await supabase
          .from("restaurants")
          .select("id, name, lat, lng, is_active")
          .eq("is_active", true);

        if (restData) {
          setRestaurants(restData.map(r => ({ ...r, lat: parseFloat(r.lat), lng: parseFloat(r.lng) })));
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, []);

  // Haversine distance
  const haversineKm = (a, b) => {
    if (!a || !b) return null;
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x = Math.sin(dLat/2)**2 + Math.sin(dLon/2)**2 * Math.cos(lat1) * Math.cos(lat2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  };

  const computeDeliveryFee = km => km == null ? 50 : km <= 2 ? 30 : km <= 5 ? 50 : 70;
  const computeEtaMinutes = km => km == null ? null : Math.max(5, Math.ceil((km/25)*60));

  const findNearestRestaurant = useCallback((userCoords) => {
    if (!restaurants || restaurants.length === 0 || !userCoords) return null;
    let best = null, bestDist = Infinity;
    restaurants.forEach(r => {
      const d = haversineKm(userCoords, { lat: r.lat, lng: r.lng });
      if (d < bestDist) { bestDist = d; best = { ...r, distanceKm: d }; }
    });
    return best;
  }, [restaurants]);

  const handleAddressComponents = useCallback(({ fullAddress, street, barangay: brgy, coords: newCoords }) => {
    setAddress(prev => ({
      ...prev,
      addressDetail: street || fullAddress || prev.addressDetail,
      barangay: brgy || prev.barangay,
    }));
    setCoords(newCoords);
    if (newCoords) {
      const nearest = findNearestRestaurant(newCoords);
      if (nearest) setNearestRestaurant(nearest);
      const km = nearest ? haversineKm(newCoords, { lat: nearest.lat, lng: nearest.lng }) : null;
      setDistanceKm(km);
      setDeliveryFee(computeDeliveryFee(km));
      setEstimatedEtaMin(computeEtaMinutes(km));
    }
  }, [findNearestRestaurant]);

  const buildShippingAddress = () => `Iligan City, Brgy. ${address.barangay} • ${address.addressDetail}`;

  const handlePlaceOrder = async () => {
    setError("");
    if (!user) { setError("User not authenticated."); return; }
    if (!address.name || !address.phone || !address.barangay || !address.addressDetail) { setError("Please fill all address fields."); return; }
    if (cart.length === 0) { setError("Cart is empty."); return; }
    if (!inDeliveryArea) { setError("Address is outside our delivery area."); return; }

    setLoading(true);
    try {
      const shipping_address = buildShippingAddress();

      let finalLat = coords?.lat || null;
      let finalLng = coords?.lng || null;

      const orderPayload = {
        user_id: user.id,
        total: totalGoods,
        shipping_address,
        contact_name: address.name,
        contact_phone: address.phone,
        payment_method: address.payment,
        status: ORDER_STATUSES[0],
        shipping_lat: finalLat,
        shipping_lng: finalLng,
        distance_km: distanceKm,
        delivery_fee: deliveryFee,
        estimated_eta_minutes: estimatedEtaMin,
        restaurant_id: nearestRestaurant?.id || null,
      };

      const { data: newOrder, error: orderError } = await supabase.from("orders").insert(orderPayload).select().single();
      if (orderError) throw orderError;

      const items = cart.map(i => ({
        order_id: newOrder.id,
        food_item_id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(items);
      if (itemsErr) { await supabase.from("orders").delete().eq("id", newOrder.id); throw itemsErr; }

      setCart([]);
      setPage("tracking", { ...newOrder, order_items: items, restaurant_name: nearestRestaurant?.name || "Unknown" });
    } catch (e) {
      console.error(e);
      setError("Failed to place order. " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!coords) { setInDeliveryArea(true); return; }
    const zonesWithPolys = deliveryZones.filter(z => z.polygon_points?.length > 2);
    if (zonesWithPolys.length > 0) {
      const inside = zonesWithPolys.some(z => {
        const poly = z.polygon_points;
        const x = coords.lng, y = coords.lat;
        let insidePoly = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].lng, yi = poly[i].lat;
          const xj = poly[j].lng, yj = poly[j].lat;
          const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi)*(y-yi)/(yj-yi+Number.EPSILON)+xi);
          if (intersect) insidePoly = !insidePoly;
        }
        return insidePoly;
      });
      setInDeliveryArea(inside);
      return;
    }
    const allowed = deliveryZones.map(z => z.barangay_name).filter(Boolean);
    setInDeliveryArea(allowed.includes(address.barangay));
  }, [coords, deliveryZones, address.barangay]);

  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-3xl">
      <SectionTitle icon="🛵" title="Final Step: Confirm Delivery" />

      <div className="bg-white p-6 rounded-2xl shadow-xl space-y-6">
        <div className="border-b pb-4" style={{ borderColor: BORDER }}>
          <h3 className="font-bold text-lg mb-4" style={{ color: NAVY }}>🏠 Delivery Details</h3>

          <AddressMapPreview
            origin={ nearestRestaurant ? { lat: nearestRestaurant.lat, lng: nearestRestaurant.lng } : { lat: 8.2280, lng: 124.2452 } }
            onAddressComponents={handleAddressComponents}
            onDistanceCalculated={({ distanceKm: dkm }) => {
              setDistanceKm(dkm);
              setDeliveryFee(computeDeliveryFee(dkm));
              setEstimatedEtaMin(computeEtaMinutes(dkm));
            }}
          />

          <div className="space-y-3 mt-3">
            <StyledInput placeholder="Recipient Name" value={address.name} onChange={e => setAddress(prev => ({ ...prev, name: e.target.value }))} />
            <StyledInput placeholder="Phone Number" value={address.phone} onChange={e => setAddress(prev => ({ ...prev, phone: e.target.value }))} />

            <div>
              <label className="text-xs font-semibold text-gray-600">Barangay (Iligan City Only)</label>
              <select value={address.barangay} onChange={e => setAddress(prev => ({ ...prev, barangay: e.target.value }))} className="w-full p-3 border rounded-lg bg-white font-semibold">
                {barangays.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <StyledInput placeholder="Street / Unit / House No." value={address.addressDetail} onChange={e => setAddress(prev => ({ ...prev, addressDetail: e.target.value }))} rows={3} isTextArea />
          </div>
        </div>

        <div className="border-b pb-4" style={{ borderColor: BORDER }}>
          <h3 className="font-bold text-lg mb-4" style={{ color: NAVY }}>💳 Payment Method</h3>
          <select value={address.payment} onChange={e => setAddress(prev => ({ ...prev, payment: e.target.value }))} className="w-full p-3 border rounded-lg bg-white font-semibold">
            <option value="COD">Cash on Delivery (COD)</option>
            <option value="E-Wallet">GCash/Maya</option>
            <option value="CreditCard">Credit/Debit Card</option>
          </select>
        </div>

        <div>
          <h3 className="font-bold text-lg mb-3" style={{ color: NAVY }}>🧾 Order Summary</h3>
          <p className="flex justify-between text-gray-600 mb-2">Subtotal ({cart.length} items): <strong>₱{totalGoods.toFixed(2)}</strong></p>
          <p className="flex justify-between text-gray-600 mb-2">Delivery Fee: <strong>₱{deliveryFee.toFixed(2)}</strong></p>
          {distanceKm && <p className="text-sm text-gray-600">Distance: {distanceKm.toFixed(2)} km • ETA: {estimatedEtaMin} min</p>}
          <p className="text-2xl font-extrabold flex justify-between mt-3">TOTAL: <span style={{color: ORANGE}}>₱{(totalGoods + deliveryFee).toFixed(2)}</span></p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {!inDeliveryArea && <p className="text-sm text-red-600">This address is outside our delivery area.</p>}
        {nearestRestaurant && <p className="text-sm text-gray-600">Assigned to: <strong>{nearestRestaurant.name}</strong></p>}
      </div>

      <div className="mt-6">
        <FoodButton onClick={handlePlaceOrder} disabled={loading || cart.length === 0 || !inDeliveryArea}>
          {loading ? "Processing..." : "Place Order Now"}
        </FoodButton>
        <FoodButton onClick={() => setPage("cart")} variant="secondary" className="mt-2">← Back to Basket</FoodButton>
      </div>
    </div>
  );
};
