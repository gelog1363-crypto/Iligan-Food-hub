// components/checkout/Checkout.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ORANGE, NAVY, BORDER } from "../../config/constants";
import { SectionTitle } from "../common/SectionTitle";
import { FoodButton } from "../common/FoodButton";
import { StyledInput } from "../common/StyledInput";
import { AddressMapPreview } from "./AddressMapPreview";

// --- Full Iligan Barangays ---
const ILIGAN_BRGYS = [
  "Abuno","Acmac","Bagong Silang","Bonbonon","Bunawan","Buru‑un","Dalipuga",
  "Del Carmen","Digkilaan","Ditucalan","Dulag","Hinaplanon","Hindang","Kabacsanan",
  "Kalilangan","Kiwalan","Lanipao","Luinab","Mahayahay","Mainit","Mandulog",
  "Maria Cristina","Pala‑o","Panoroganan","Poblacion","Puga‑an","Rogongon",
  "San Miguel","San Roque","Saray‑Tibanga","Santa Elena","Santa Filomena","Santo Rosario",
  "Suarez","Tambacan","Tibanga","Tipanoy","Tomas Cabili","Tubod","Ubaldo Laya",
  "Upper Hinaplanon","Upper Tominobo","Villa Verde"
];

export const Checkout = ({ setPage, cart, setCart, user }) => {
  const [address, setAddress] = useState({
    name: "", phone: "", addressDetail: "", barangay: ILIGAN_BRGYS[0], payment: "COD"
  });
  const [coords, setCoords] = useState(null);
  const [distanceText, setDistanceText] = useState("");
  const [distanceKm, setDistanceKm] = useState(null);
  const [estimatedEtaMin, setEstimatedEtaMin] = useState(null);
  const [inDeliveryArea, setInDeliveryArea] = useState(true);
  const [restaurants, setRestaurants] = useState([]);
  const [nearestRestaurant, setNearestRestaurant] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const totalGoods = useMemo(() => cart.reduce((s, it) => s + it.price * it.quantity, 0), [cart]);

  const computeDeliveryFee = (km) => {
    if (km == null) return 50;
    if (km <= 2) return 30;
    if (km <= 5) return 50;
    return 70;
  };
  const deliveryFee = useMemo(() => computeDeliveryFee(distanceKm), [distanceKm]);

  // --- Utilities ---
  const haversineKm = (a, b) => {
    if (!a || !b) return null;
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const sinDlat = Math.sin(dLat / 2), sinDlon = Math.sin(dLon / 2);
    const x = sinDlat * sinDlat + sinDlon * sinDlon * Math.cos(lat1) * Math.cos(lat2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const computeEtaMinutes = (km) => {
    if (km == null) return null;
    const avgSpeedKmph = 25;
    return Math.max(5, Math.ceil((km / avgSpeedKmph) * 60));
  };

  const findNearestRestaurant = useCallback((userCoords) => {
    if (!restaurants || restaurants.length === 0 || !userCoords) return null;
    let best = null, bestDist = Infinity;
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
      barangay: brgy && brgy.length > 0 ? brgy : prev.barangay
    }));
    setCoords(newCoords);
    if (newCoords) {
      const nearest = findNearestRestaurant(newCoords);
      if (nearest) setNearestRestaurant(nearest);
      const roughKm = nearest ? haversineKm(newCoords, { lat: nearest.lat, lng: nearest.lng }) : null;
      setDistanceKm(roughKm);
      setEstimatedEtaMin(computeEtaMinutes(roughKm));
    }
  }, [findNearestRestaurant]);

  const handleDistanceFromMap = useCallback(({ distanceText: dt, distanceKm: dkm }) => {
    setDistanceText(dt || "");
    setDistanceKm(dkm);
    setEstimatedEtaMin(computeEtaMinutes(dkm));
  }, []);

  const buildShippingAddress = () => `Iligan City, Brgy. ${address.barangay} • ${address.addressDetail}`;

  const handlePlaceOrder = async () => {
    setError("");
    if (!address.name || !address.phone || !address.barangay || !address.addressDetail) {
      setError("Please fill Recipient Name, Phone, Barangay, and Full Address details."); return;
    }
    if (cart.length === 0) { setError("Your cart is empty."); return; }
    if (!inDeliveryArea) { setError("Address is outside our delivery area."); return; }

    setLoading(true);
    try {
      // simulate order success since we have no DB
      const orderForTracking = {
        user_id: user?.id || "guest",
        order_items: cart,
        shipping_address: buildShippingAddress(),
        delivery_fee: deliveryFee,
        estimated_eta_minutes: estimatedEtaMin,
        restaurant_name: nearestRestaurant?.name || "Unknown Restaurant"
      };

      setCart([]);
      setPage("tracking", orderForTracking);
    } catch (e) {
      setError("Failed to place order. " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInDeliveryArea(ILIGAN_BRGYS.includes(address.barangay));
  }, [address.barangay]);

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
            onDistanceCalculated={handleDistanceFromMap}
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
              <label className="text-xs font-semibold text-gray-600 mb-1">Barangay (Iligan City Only)</label>
              <select
                value={address.barangay}
                onChange={e => setAddress(prev => ({ ...prev, barangay: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg bg-white font-semibold focus:ring-2 focus:ring-offset-0 input-focus-shopee"
              >
                {ILIGAN_BRGYS.map(b => <option key={b} value={b}>{b}</option>)}
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
              className="w-full p-3 border border-gray-300 rounded-lg bg-white font-semibold focus:ring-2 focus:ring-offset-0 input-focus-shopee"
              style={{ paddingRight: "2.5rem" }}
            >
              <option value="COD">Cash on Delivery (COD) - Preferred</option>
              <option value="E-Wallet">GCash/Maya (E-Wallet)</option>
              <option value="CreditCard">Credit/Debit Card</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
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
          <p className="text-sm text-gray-600 mb-2">
            {distanceText && <>🚗 Distance: <strong>{distanceText}</strong></>}
            {distanceKm != null && <span> • {distanceKm.toFixed(2)} km</span>}
          </p>
          {estimatedEtaMin != null && (
            <p className="text-sm text-gray-600 mb-3">⏱️ ETA: <strong>{estimatedEtaMin} min</strong></p>
          )}
          <p className="text-2xl font-extrabold flex justify-between">
            <span>TOTAL:</span>
            <span style={{ color: ORANGE }}>₱{(totalGoods + deliveryFee).toFixed(2)}</span>
          </p>
        </div>

        {error && <p className="text-sm text-red-500 mt-4 font-medium">{error}</p>}
        {!inDeliveryArea && <p className="text-sm text-red-600 mt-2">This address is outside our delivery area.</p>}
        {nearestRestaurant && <p className="text-sm text-gray-600 mt-2">Assigned to: <strong>{nearestRestaurant.name}</strong></p>}
      </div>

      <div className="mt-6">
        <FoodButton
          onClick={handlePlaceOrder}
          disabled={loading || cart.length === 0 || !inDeliveryArea}
        >
          {loading ? "Processing..." : "Place Order Now"}
        </FoodButton>

        <FoodButton onClick={() => setPage("cart")} variant="secondary" className="mt-2">
          ← Back to Basket
        </FoodButton>
      </div>
    </div>
  );
};
