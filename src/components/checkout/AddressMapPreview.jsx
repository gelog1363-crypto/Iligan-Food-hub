// components/checkout/AddressMapPreview.jsx
import React, { useEffect, useState, useCallback } from "react";
import { GoogleMap, Marker, useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { ORANGE } from "../../config/constants";

const libraries = ["places"];

export const AddressMapPreview = ({
  onAddressComponents = () => {},   // { fullAddress, street, barangay, coords }
  onDistanceCalculated = () => {},  // { distanceText, distanceKm }
  origin = { lat: 8.2280, lng: 124.2452 },
}) => {
  const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_KEY, libraries });

  const [mapCenter, setMapCenter] = useState(origin);
  const [markerPos, setMarkerPos] = useState(origin);
  const [autocomplete, setAutocomplete] = useState(null);

  const reverseGeocode = useCallback((coords) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();

    geocoder.geocode({ location: coords }, (results, status) => {
      if (status === "OK" && results && results.length > 0) {
        const primary = results.find(r => r.types.includes("street_address")) || results[0];
        let barangay = "";
        primary.address_components.forEach(comp => {
          const types = comp.types || [];
          if (types.includes("sublocality_level_1") || types.includes("sublocality") || types.includes("neighborhood")) {
            barangay = comp.long_name.replace(/^Barangay\s*/i, "");
          }
        });
        const fullAddress = primary.formatted_address || "";
        onAddressComponents({ fullAddress, street: fullAddress, barangay, coords });
      }
    });
  }, [onAddressComponents]);

  const calculateDistance = useCallback((coords) => {
    if (!window.google) return onDistanceCalculated({ distanceText: null, distanceKm: null });
    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      { origins: [origin], destinations: [coords], travelMode: window.google.maps.TravelMode.DRIVING, unitSystem: window.google.maps.UnitSystem.METRIC },
      (response, status) => {
        if (status === "OK" && response.rows[0] && response.rows[0].elements[0]) {
          const el = response.rows[0].elements[0];
          const km = el.distance ? el.distance.value / 1000 : null;
          onDistanceCalculated({ distanceText: el.distance?.text, distanceKm: km });
        } else onDistanceCalculated({ distanceText: null, distanceKm: null });
      }
    );
  }, [origin, onDistanceCalculated]);

  const onPlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    if (!place || !place.geometry) return;
    const coords = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
    setMapCenter(coords);
    setMarkerPos(coords);
    reverseGeocode(coords);
    calculateDistance(coords);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return alert("GPS not available.");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
