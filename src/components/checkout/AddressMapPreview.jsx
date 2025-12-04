// components/checkout/AddressMapPreview.jsx
import React, { useEffect, useState, useCallback } from "react";
import { GoogleMap, Marker, useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { ORANGE } from "../../config/constants";

const libraries = ["places"];

export const AddressMapPreview = ({
  // callbacks to parent (Checkout.jsx)
  onAddressComponents = () => {},         // receives { fullAddress, street, barangay, coords }
  onDistanceCalculated = () => {},        // receives { distanceText, distanceKm }
  origin = { lat: 8.2280, lng: 124.2452 },// restaurant coords fallback
}) => {
  const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_KEY, libraries });

  const [mapCenter, setMapCenter] = useState(origin);
  const [markerPos, setMarkerPos] = useState(origin);
  const [autocomplete, setAutocomplete] = useState(null);

  // Reverse geocode -> extract barangay + street + formatted address
  const reverseGeocode = useCallback((coords) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();

    geocoder.geocode({ location: coords }, (results, status) => {
      if (status === "OK" && results && results.length > 0) {
        // prefer the most specific result
        const primary = results.find(r => r.types && r.types.includes("street_address")) || results[0];

        let barangay = "";
        let street = "";
        // iterate components to find sublocality or political info for barangay
        primary.address_components.forEach((comp) => {
          const types = comp.types || [];
          if (types.includes("sublocality_level_1") || types.includes("sublocality") || types.includes("neighborhood")) {
            // Google sometimes returns "Barangay X" in long_name - normalize
            barangay = comp.long_name.replace(/^Barangay\s*/i, "");
          }
          if (types.includes("route") || types.includes("street_number")) {
            // accumulate street info — we will build street below
            // We'll get route and street_number if available
          }
        });

        // To create a street string, use a best-effort approach with the formatted address parts
        // fallback: remove city and country
        let fullAddress = primary.formatted_address || "";
        // Attempt to extract relative street portion from formatted_address
        // E.g. "Brgy. XYZ, Some St, Iligan City, ...", we want "Some St, Brgy. XYZ" ideally.
        // Simpler approach: provide fullAddress to parent; parent can parse if needed.
        onAddressComponents({
          fullAddress,
          street: fullAddress, // parent will place into addressDetail (they can trim as needed)
          barangay: barangay,
          coords,
        });
      }
    });
  }, [onAddressComponents]);

  // Calculate distance using DistanceMatrix (driving) and return text + km
  const calculateDistance = useCallback((coords) => {
    if (!window.google) {
      onDistanceCalculated({ distanceText: null, distanceKm: null });
      return;
    }

    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [coords],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        if (status === "OK" && response.rows && response.rows[0] && response.rows[0].elements[0]) {
          const el = response.rows[0].elements[0];
          const distanceText = el.distance ? el.distance.text : null;
          const distanceMeters = el.distance ? el.distance.value : null;
          const distanceKm = distanceMeters != null ? distanceMeters / 1000 : null;
          onDistanceCalculated({ distanceText, distanceKm });
        } else {
          onDistanceCalculated({ distanceText: null, distanceKm: null });
        }
      }
    );
  }, [origin, onDistanceCalculated]);

  // When place selected from autocomplete
  const onPlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    if (!place || !place.geometry) return;

    const coords = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    setMapCenter(coords);
    setMarkerPos(coords);
    reverseGeocode(coords);
    calculateDistance(coords);
  };

  // Use device GPS
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("GPS not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMapCenter(coords);
        setMarkerPos(coords);
        reverseGeocode(coords);
        calculateDistance(coords);
      },
      () => alert("Unable to fetch your location.")
    );
  };

  if (!isLoaded) return <div className="p-4">Loading map…</div>;

  return (
    <div className="w-full rounded-lg overflow-hidden border mb-4" style={{ borderColor: ORANGE }}>
      <div className="p-2 text-center text-sm font-semibold text-white" style={{ backgroundColor: ORANGE }}>
        📍 Interactive Map — drag pin, search, or use GPS
      </div>

      <div className="p-2 bg-gray-100">
        <Autocomplete onLoad={setAutocomplete} onPlaceChanged={onPlaceChanged}>
          <input
            type="text"
            placeholder="Search street / landmark (autocomplete)"
            className="w-full p-3 border rounded-lg"
          />
        </Autocomplete>

        <button
          onClick={handleUseMyLocation}
          className="mt-2 w-full p-2 rounded-lg font-semibold"
          style={{ backgroundColor: ORANGE, color: "white" }}
        >
          📌 Use My Location
        </button>
      </div>

      <GoogleMap
        center={mapCenter}
        zoom={15}
        mapContainerStyle={{ width: "100%", height: "320px" }}
      >
        <Marker
          position={markerPos}
          draggable={true}
          onDragEnd={(e) => {
            const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            setMarkerPos(coords);
            reverseGeocode(coords);
            calculateDistance(coords);
          }}
        />
      </GoogleMap>
    </div>
  );
};
