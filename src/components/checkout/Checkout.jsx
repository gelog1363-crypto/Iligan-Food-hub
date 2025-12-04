// components/checkout/Checkout.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../config/supabase";
import { ORANGE, NAVY, BORDER, ORDER_STATUSES } from "../../config/constants";
import { SectionTitle } from "../common/SectionTitle";
import { FoodButton } from "../common/FoodButton";
import { StyledInput } from "../common/StyledInput";
import { AddressMapPreview } from "./AddressMapPreview";

// Hardcoded all Iligan City barangays
const ILIGAN_BARANGAYS = [
  "Abuno", "Bagong Silang", "Baloi", "Buru-un", "Cawayan", "Damulog", "Dolores",
  "Fortune", "Guintolohan", "Hinaplanon", "Iponan", "Kolambugan", "Kiwalan", "Lanao",
  "Lumbia", "Mahayahay", "Maranding", "Pala-o", "Poblacion", "Pugaan", "Punta",
  "San Roque", "Santa Elena", "Santa Filomena", "Santa Maria", "Santo Niño",
  "Santo Rosario", "Sapang Dalaga", "Sara", "Taboc", "Tipanoy", "Tubod", "Tugaya",
  "Tukuran", "Upper Hinaplanon", "Upper Poblacion", "Upper Tipanoy"
];

export const Checkout = ({ setPage, cart, setCart, user }) => {
  const [address, setAddress] = useState({
    name: "",
    phone: "",
    addressDetail: "",
    barangay: ILIGAN_BARANGAYS[0],
    payment: "COD",
  });

  const [restaurants, setRestaurants] = useState([]);
  const [coords, setCoords] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [estimatedEtaMin, setEstimatedEtaMin] = useState(null);
  const [inDeliveryArea, setInDeliveryArea] = useState(true);
  const [nearestRestaurant, setNearestRestaurant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalGoods = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  // Fetch active restaurants
  useEffect(() => {
    const fetchRestaurants = async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, lat, lng, is_active")
        .eq("is_active", true);

      if (error) return console.error("restaurants fetch error", error);

      if (data) {
        const normalized = data.map(r => ({ ...r, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));
        setRestaurants(normalized);
      }
    };
    fetchRestaurants();
  }, []);

  // ---------- Utilities ----------
  const haversineKm = (a, b) => {
    if (!a || !b) return null;
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDlat = Math.sin(dLat / 2);
    const sinDlon = Math.sin(dLon / 2);
    const x = sinDlat * sinDlat + sinDlon * sinDlon * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  };

  const computeDeliveryFee = (km) => {
    if (km == null) return 50;
    if (km <= 2) return 30;
    if (km <= 5) return 50;
    return 70;
  };

  const computeEtaMinutes = (km) => {
    if (km == null) return null;
    const avgSpeedKmph = 25;
    return Math.max(5, Math.ceil((km / avgSpeedKmph) * 60));
  };

  const findNearestRestaurant = useCallback((userCoords) => {
    if (!restaurants || restaurants.length === 0 || !userCoords) return null;
    let best = null;
    let bestDist = Infinity;
    restaurants.forEach(r => {
      if (r.lat == null || r.lng == null) return;
      const d = haversineKm(userCoords, { lat: r.lat, lng: r.lng });
      if (d < bestDist) {
        bestDist = d;
        best = { ...r, distanceKm: d };
      }
    });
    return best;
  }, [restaurants]);

  const handleAddressComponents = useCallback(({ fullAddress, street, barangay: brgy, coords: newCoords }) => {
    setAddress(prev => ({
      ...prev,
      addressDetail: street && street.length > 0 ? street : fullAddress || prev.addressDetail,
      barangay: brgy && brgy.length > 0 ? brgy : prev.barangay,
    }));

    setCoords(newCoords);

    if (newCoords) {
      const nearest = findNearestRestaurant(newCoords);
      if (nearest) setNearestRestaurant(nearest);

      const roughKm = nearest ? haversineKm(newCoords, { lat: nearest.lat, lng: nearest.lng }) : null;
      setDistanceKm(roughKm);
      setDeliveryFee(computeDeliveryFee(roughKm));
      setEstimatedEtaMin(computeEtaMinutes(roughKm));
    }
  }, [findNearestRestaurant]);

  const buildShippingAddress = () => {
    return `Iligan City, Brgy. ${address.barangay} • ${address.addressDetail}`;
  };

  const handlePlaceOrder = async () => {
    setError("");
    if (!user) {
      setError("User not authenticated.");
      return;
    }
    if (!address.name || !address.phone || !address.barangay || !address.addressDetail) {
      setError("Please fill Recipient Name, Phone, Barangay, and Full Address details.");
      return;
    }
    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setLoading(true);
    try {
      const shipping_address_combined = buildShippingAddress();

      const orderPayload = {
        user_id: user.id,
        total: totalGoods,
        shipping_address: shipping_address_combined,
        contact_name: address.name,
        contact_phone: address.phone,
        payment_method: address.payment,
        status: ORDER_STATUSES[0],
        shipping_lat: coords?.lat || null,
        shipping_lng: coords?.lng || null,
        distance_km: distanceKm,
        delivery_fee: deliveryFee,
        estimated_eta_minutes: estimatedEtaMin,
        restaurant_id: nearestRestaurant?.id || null,
      };

      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select()
        .single();

      if (orderError) throw orderError;
      if (!newOrder) throw new Error("No order returned.");

      const orderId = newOrder.id;
      const itemData = cart.map(item => ({
        order_id: orderId,
        food_item_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(itemData);
      if (itemsErr) {
        await supabase.from("orders").delete().eq("id", orderId);
        throw itemsErr;
      }

      setCart([]);
      const orderForTracking = {
        ...newOrder,
        order_items: itemData,
        restaurant_name: nearestRestaurant?.name || "Unknown Restaurant",
      };
      setPage("tracking", orderForTracking);
    } catch (e) {
      console.error(e);
      setError("Failed to place order. " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 mx-auto w-full max-w-3xl">
      <SectionTitle icon="🛵" title="Final Step: Confirm Delivery" />
      <div className="bg-white p-6 rounded-2xl shadow-xl space-y-6">
        {/* Delivery details */}
        <div className="border-b pb-4" style={{ borderColor: BORDER }}>
          <h3 className="font-bold text-lg mb-4" style={{ color: NAVY }}>
            <span className="text-xl mr-2">🏠</span>Delivery Details
          </h3>

          <AddressMapPreview
            origin={nearestRestaurant ? { lat: nearestRestaurant.lat, lng: nearestRestaurant.lng } : { lat: 8.2280, lng: 124.2452 }}
            onAddressComponents={handleAddressComponents}
          />

          <div className="space-y-3">
            <StyledInput
              placeholder="Recipient Name"
              value={address.name}
              onChange={e => setAddress(prev => ({ ...prev, name: e.target.value }))}
              required
            />
            <StyledInput
              type="tel"
              placeholder="Phone Number"
              value={address.phone}
              onChange={e => setAddress(prev => ({ ...prev, phone: e.target.value }))}
              required
            />

            <div>
              <label className="text-xs font-semibold text-gray-600">Barangay (Iligan City Only)</label>
              <select
                value={address.barangay}
                onChange={e => setAddress(prev => ({ ...prev, barangay: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg appearance-none bg-white font-semibold focus:ring-2 focus:ring-offset-0 input-focus-shopee"
              >
                {ILIGAN_BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <StyledInput
              placeholder="Street / Unit / House No."
              value={address.addressDetail}
              onChange={e => setAddress(prev => ({ ...prev, addressDetail: e.target.value }))}
              rows="3"
              isTextArea
              required
            />
          </div>
        </div>

        {/* Payment */}
        <div className="border-b pb-4" style={{ borderColor: BORDER }}>
          <h3 className="font-bold text-lg mb-4" style={{ color: NAVY }}>
            <span className="text-xl mr-2">💳</span>Payment Method
          </h3>
          <div className="relative">
            <select
              value={address.payment}
              onChange={e => setAddress(prev => ({ ...prev, payment: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg appearance-none bg-white font-semibold focus:ring-2 focus:ring-offset-0 input-focus-shopee"
              style={{ paddingRight: "2.5rem" }}
            >
              <option value="COD">Cash on Delivery (COD)</option>
              <option value="E-Wallet">GCash/Maya</option>
              <option value="CreditCard">Credit/Debit Card</option>
            </select>
          </div>
        </div>

        {/* Order summary */}
        <div className="pt-2">
          <h3 className="font-bold text-lg mb-3" style={{ color: NAVY }}>
            <span className="text-xl mr-2">🧾</span>Order Summary
          </h3>

          <p className="text-lg flex justify-between mb-2 text-gray-600">
            <span>Subtotal ({cart.length} items):</span>
            <span className="font-semibold">₱{totalGoods.toFixed(2)}</span>
          </p>

          <p className="text-lg flex justify-between text-gray-600 border-b pb-3 mb-3" style={{ borderColor: BORDER }}>
            <span>Delivery Fee:</span>
            <span className="font-semibold">₱{deliveryFee.toFixed(2)}</span>
          </p>

          {distanceKm != null && <p className="text-sm text-gray-600 mb-2">🚗 Distance: {distanceKm.toFixed(2)} km</p>}
          {estimatedEtaMin != null && <p className="text-sm text-gray-600 mb-3">⏱️ ETA: {estimatedEtaMin} min</p>}

          <p className="text-2xl font-extrabold flex justify-between">
            <span>TOTAL:</span>
            <span style={{ color: ORANGE }}>₱{(totalGoods + deliveryFee).toFixed(2)}</span>
          </p>

          {error && <p className="text-sm text-red-500 mt-4 font-medium">{error}</p>}
          {!inDeliveryArea && <p className="text-sm text-red-600 mt-2">This address is outside our delivery area.</p>}
          {nearestRestaurant && <p className="text-sm text-gray-600 mt-2">Assigned to: <strong>{nearestRestaurant.name}</strong></p>}
        </div>
      </div>

      <div className="mt-6">
        <FoodButton onClick={handlePlaceOrder} disabled={loading || cart.length === 0 || !inDeliveryArea}>
          {loading ? "Processing..." : "Place Order Now"}
        </FoodButton>

        <FoodButton onClick={() => setPage("cart")} variant="secondary" className="mt-2">
          ← Back to Basket
        </FoodButton>
      </div>
    </div>
  );
};
