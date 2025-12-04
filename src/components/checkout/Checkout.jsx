// components/checkout/Checkout.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../config/supabase";
import { ORANGE, NAVY, BORDER, ORDER_STATUSES } from "../../config/constants";
import { SectionTitle } from "../common/SectionTitle";
import { FoodButton } from "../common/FoodButton";
import { StyledInput } from "../common/StyledInput";
import { AddressMapPreview } from "./AddressMapPreview";

export const Checkout = ({ setPage, cart, setCart, user }) => {
  // Basic address fields
  const [address, setAddress] = useState({
    name: "",
    phone: "",
    addressDetail: "",
    barangay: "",
    payment: "COD",
  });

  // App state
  const [barangays, setBarangays] = useState([]);
  const [deliveryZones, setDeliveryZones] = useState([]); // includes polygon_points optional
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Location / distance / fee / ETA
  const [coords, setCoords] = useState(null);         // { lat, lng }
  const [distanceText, setDistanceText] = useState("");
  const [distanceKm, setDistanceKm] = useState(null);
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [estimatedEtaMin, setEstimatedEtaMin] = useState(null);
  const [inDeliveryArea, setInDeliveryArea] = useState(true);
  const [nearestRestaurant, setNearestRestaurant] = useState(null);

  // total
  const totalGoods = useMemo(() => cart.reduce((s, it) => s + it.price * it.quantity, 0), [cart]);

  // fetch initial data: barangays / zones / restaurants
  useEffect(() => {
    const fetchData = async () => {
      try {
        // delivery zones (barangays & optional polygon_points)
        const { data: zonesData, error: zoneErr } = await supabase
          .from("delivery_zones")
          .select("barangay_name, polygon_points, is_active")
          .eq("is_active", true);

        if (zoneErr) console.error("delivery_zones err", zoneErr);
        if (zonesData) {
          setDeliveryZones(zonesData);
          const brs = zonesData.map(z => z.barangay_name).filter(Boolean);
          setBarangays(brs);
          if (brs.length > 0 && !address.barangay) {
            setAddress(prev => ({ ...prev, barangay: brs[0] }));
          }
        }

        // restaurants
        const { data: restData, error: restErr } = await supabase
          .from("restaurants")
          .select("id, name, lat, lng, is_active")
          .eq("is_active", true);

        if (restErr) console.error("restaurants err", restErr);
        if (restData) {
          // normalize numbers
          const normalized = restData.map(r => ({ ...r, lat: parseFloat(r.lat), lng: parseFloat(r.lng) }));
          setRestaurants(normalized);
        }
      } catch (e) {
        console.error("fetchData error", e);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- utilities ----------
  const haversineKm = (a, b) => {
    if (!a || !b) return null;
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371; // km
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

  // ray-casting point-in-polygon
  const pointInPolygon = (point, polygon) => {
    if (!polygon || polygon.length < 3) return false;
    const x = point.lng, y = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi + Number.EPSILON) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
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
    const mins = Math.max(5, Math.ceil((km / avgSpeedKmph) * 60));
    return mins;
  };

  // Choose nearest restaurant by Haversine
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

  // When address components come from AddressMapPreview (reverse geocode or autocomplete)
  const handleAddressComponents = useCallback(({ fullAddress, street, barangay: brgy, coords: newCoords }) => {
    // fullAddress -> addressDetail (but keep user's typed specific if they had typed)
    setAddress(prev => ({
      ...prev,
      addressDetail: (street && street.length > 0) ? street : fullAddress || prev.addressDetail,
      barangay: brgy && brgy.length > 0 ? brgy : prev.barangay,
    }));

    // store coordinates
    setCoords(newCoords);

    // find nearest restaurant & compute fee/ETA/distance
    if (newCoords) {
      const nearest = findNearestRestaurant(newCoords);
      if (nearest) setNearestRestaurant(nearest);

      // compute Haversine or rely on Distance matrix result (we use distanceKm from onDistanceCalculated)
      // If distanceKm already set then use it; else compute rough
      const roughKm = nearest ? haversineKm(newCoords, { lat: nearest.lat, lng: nearest.lng }) : null;
      const usedKm = distanceKm != null ? distanceKm : roughKm;
      setDeliveryFee(computeDeliveryFee(usedKm));
      setEstimatedEtaMin(computeEtaMinutes(usedKm));
    }
  }, [distanceKm, findNearestRestaurant]);

  // When AddressMapPreview returns distance via DistanceMatrix
  const handleDistanceFromMap = useCallback(({ distanceText: dt, distanceKm: dkm }) => {
    setDistanceText(dt || "");
    setDistanceKm(dkm);
    setDeliveryFee(computeDeliveryFee(dkm));
    setEstimatedEtaMin(computeEtaMinutes(dkm));

    // if coords already set, choose nearest restaurant
    if (coords) {
      const nearest = findNearestRestaurant(coords);
      if (nearest) setNearestRestaurant(nearest);
    }
  }, [coords, findNearestRestaurant]);

  // Build shipping address string for DB
  const buildShippingAddress = () => {
    return `Iligan City, Brgy. ${address.barangay} • ${address.addressDetail}`;
  };

  // Place order (inserts into orders + order_items)
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
    if (!inDeliveryArea) {
      setError("Address is outside our delivery area.");
      return;
    }

    setLoading(true);
    try {
      const shipping_address_combined = buildShippingAddress();

      // if coords are not present, attempt a last-minute geocode client-side
      let finalLat = coords ? coords.lat : null;
      let finalLng = coords ? coords.lng : null;
      if ((!finalLat || !finalLng) && typeof window !== "undefined" && window.google) {
        // geocode shipping_address_combined
        const geocoder = new window.google.maps.Geocoder();
        const geoPromise = () => new Promise((resolve) => {
          geocoder.geocode({ address: shipping_address_combined }, (results, status) => {
            if (status === "OK" && results[0]) {
              const loc = results[0].geometry.location;
              resolve({ lat: loc.lat(), lng: loc.lng() });
            } else {
              resolve(null);
            }
          });
        });
        const g = await geoPromise();
        if (g) {
          finalLat = g.lat;
          finalLng = g.lng;
        }
      }

      const orderPayload = {
        user_id: user.id,
        total: totalGoods,
        shipping_address: shipping_address_combined,
        contact_name: address.name,
        contact_phone: address.phone,
        payment_method: address.payment,
        status: ORDER_STATUSES[0],
        shipping_lat: finalLat,
        shipping_lng: finalLng,
        distance_km: distanceKm,
        delivery_fee: deliveryFee,
        estimated_eta_minutes: estimatedEtaMin,
        restaurant_id: nearestRestaurant ? nearestRestaurant.id : null,
      };

      // Insert order
      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert(orderPayload)
        .select()
        .single();

      if (orderError) throw orderError;
      if (!newOrder) throw new Error("No order returned after insert.");

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
        // rollback
        await supabase.from("orders").delete().eq("id", orderId);
        throw itemsErr;
      }

      // clear cart + navigate to tracking (attach order_items + restaurant name)
      const orderForTracking = {
        ...newOrder,
        order_items: itemData,
        restaurant_name: nearestRestaurant ? nearestRestaurant.name : "Unknown Restaurant",
      };
      setCart([]);
      setPage("tracking", orderForTracking);
    } catch (e) {
      console.error("placeOrder error", e);
      setError("Failed to place order. " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // When coords are updated, validate delivery zone
  useEffect(() => {
    if (!coords) {
      setInDeliveryArea(true);
      return;
    }

    // 1) If polygons exist in deliveryZones, check point-in-polygon against any
    const zonesWithPolys = deliveryZones.filter(z => z.polygon_points && Array.isArray(z.polygon_points) && z.polygon_points.length > 2);
    if (zonesWithPolys.length > 0) {
      // polygon_points expected as [{lat, lng}, ...]
      const matched = zonesWithPolys.some(z => pointInPolygon(coords, z.polygon_points));
      setInDeliveryArea(!!matched);
      return;
    }

    // 2) fallback: check barangay membership (if deliveryZones includes barangay_name list)
    const allowedBarangays = deliveryZones.map(z => z.barangay_name).filter(Boolean);
    if (allowedBarangays.length > 0) {
      setInDeliveryArea(allowedBarangays.includes(address.barangay));
      return;
    }

    // default allow
    setInDeliveryArea(true);
  }, [coords, deliveryZones, address.barangay]);

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
            origin={ nearestRestaurant ? { lat: nearestRestaurant.lat, lng: nearestRestaurant.lng } : { lat: 8.2280, lng: 124.2452 } }
            onAddressComponents={(data) => handleAddressComponents(data)}
            onDistanceCalculated={(d) => handleDistanceFromMap(d)}
          />

          <div className="space-y-3">
            <StyledInput
              placeholder="Recipient Name"
              value={address.name}
              onChange={(e) => setAddress(prev => ({ ...prev, name: e.target.value }))}
              required
            />
            <StyledInput
              type="tel"
              placeholder="Phone Number"
              value={address.phone}
              onChange={(e) => setAddress(prev => ({ ...prev, phone: e.target.value }))}
              required
            />

            <div>
              <label className="text-xs font-semibold text-gray-600">Barangay (Iligan City Only)</label>
              <select
                value={address.barangay}
                onChange={(e) => setAddress(prev => ({ ...prev, barangay: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg appearance-none bg-white font-semibold focus:ring-2 focus:ring-offset-0 input-focus-shopee"
                disabled={barangays.length === 0}
              >
                {barangays.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <StyledInput
              placeholder="Street / Unit / House No."
              value={address.addressDetail}
              onChange={(e) => setAddress(prev => ({ ...prev, addressDetail: e.target.value }))}
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
              onChange={(e) => setAddress(prev => ({ ...prev, payment: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg appearance-none bg-white font-semibold focus:ring-2 focus:ring-offset-0 input-focus-shopee"
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
        <FoodButton onClick={handlePlaceOrder} disabled={loading || barangays.length === 0 || cart.length === 0 || !inDeliveryArea}>
          {loading ? "Processing..." : "Place Order Now"}
        </FoodButton>

        <FoodButton onClick={() => setPage("cart")} variant="secondary" className="mt-2">
          ← Back to Basket
        </FoodButton>
      </div>
    </div>
  );
};
