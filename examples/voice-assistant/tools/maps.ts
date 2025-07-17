import { createTool } from '@inngest/agent-kit';
import { z } from 'zod';
import type { VoiceAssistantNetworkState } from '../index';

function getApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
  }
  return apiKey;
}

const GOOGLE_MAPS_API_KEY = getApiKey();

// Geocode Tool
const geocodeParams = z.object({
  address: z.string().describe('The address to geocode'),
});

export const geocodeTool = createTool<
  typeof geocodeParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_geocode',
  description: 'Convert an address into geographic coordinates',
  parameters: geocodeParams,
  handler: async ({ address }) => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.append('address', address);
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(`Geocoding failed: ${data.error_message || data.status}`);
    }
    if (!data.results || data.results.length === 0) {
      return { success: false, message: 'No results found' };
    }
    const { geometry, formatted_address, place_id } = data.results[0];
    return {
      location: geometry.location,
      formatted_address,
      place_id,
    };
  },
});

// Reverse Geocode Tool
const reverseGeocodeParams = z.object({
  latitude: z.number().describe('Latitude coordinate'),
  longitude: z.number().describe('Longitude coordinate'),
});

export const reverseGeocodeTool = createTool<
  typeof reverseGeocodeParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_reverse_geocode',
  description: 'Convert coordinates into an address',
  parameters: reverseGeocodeParams,
  handler: async ({ latitude, longitude }) => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.append('latlng', `${latitude},${longitude}`);
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(
        `Reverse geocoding failed: ${data.error_message || data.status}`
      );
    }
    if (!data.results || data.results.length === 0) {
      return { success: false, message: 'No results found' };
    }
    const { formatted_address, place_id, address_components } = data.results[0];
    return {
      formatted_address,
      place_id,
      address_components,
    };
  },
});

// Search Places Tool
const searchPlacesParams = z.object({
  query: z.string().describe('Search query'),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .describe('Optional center point for the search')
    .nullable(),
  radius: z.number().describe('Search radius in meters (max 50000)').nullable(),
});

export const searchPlacesTool = createTool<
  typeof searchPlacesParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_search_places',
  description: 'Search for places using Google Places API',
  parameters: searchPlacesParams,
  handler: async ({ query, location, radius }) => {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/textsearch/json'
    );
    url.searchParams.append('query', query);
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    if (location) {
      url.searchParams.append(
        'location',
        `${location.latitude},${location.longitude}`
      );
    }
    if (radius) {
      url.searchParams.append('radius', radius.toString());
    }
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(
        `Place search failed: ${data.error_message || data.status}`
      );
    }
    return {
      places: data.results.map((place: any) => ({
        name: place.name,
        formatted_address: place.formatted_address,
        location: place.geometry.location,
        place_id: place.place_id,
        rating: place.rating,
        types: place.types,
      })),
    };
  },
});

// Place Details Tool
const placeDetailsParams = z.object({
  place_id: z.string().describe('The place ID to get details for'),
});

export const placeDetailsTool = createTool<
  typeof placeDetailsParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_place_details',
  description: 'Get detailed information about a specific place',
  parameters: placeDetailsParams,
  handler: async ({ place_id }) => {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/place/details/json'
    );
    url.searchParams.append('place_id', place_id);
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(
        `Place details request failed: ${data.error_message || data.status}`
      );
    }
    const { result } = data;
    return {
      name: result.name,
      formatted_address: result.formatted_address,
      location: result.geometry.location,
      formatted_phone_number: result.formatted_phone_number,
      website: result.website,
      rating: result.rating,
      reviews: result.reviews,
      opening_hours: result.opening_hours,
    };
  },
});

// Distance Matrix Tool
const distanceMatrixParams = z.object({
  origins: z
    .array(z.string())
    .describe('Array of origin addresses or coordinates'),
  destinations: z
    .array(z.string())
    .describe('Array of destination addresses or coordinates'),
  mode: z
    .enum(['driving', 'walking', 'bicycling', 'transit'])
    .describe('Travel mode (driving, walking, bicycling, transit)')
    .nullable(),
});

export const distanceMatrixTool = createTool<
  typeof distanceMatrixParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_distance_matrix',
  description:
    'Calculate travel distance and time for multiple origins and destinations',
  parameters: distanceMatrixParams,
  handler: async ({ origins, destinations, mode }) => {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/distancematrix/json'
    );
    url.searchParams.append('origins', origins.join('|'));
    url.searchParams.append('destinations', destinations.join('|'));
    if (mode) {
      url.searchParams.append('mode', mode);
    }
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(
        `Distance matrix request failed: ${data.error_message || data.status}`
      );
    }
    return {
      origin_addresses: data.origin_addresses,
      destination_addresses: data.destination_addresses,
      results: data.rows.map((row: any) => ({
        elements: row.elements.map((element: any) => ({
          status: element.status,
          duration: element.duration,
          distance: element.distance,
        })),
      })),
    };
  },
});

// Elevation Tool
const elevationParams = z.object({
  locations: z
    .array(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
      })
    )
    .describe('Array of locations to get elevation for'),
});

export const elevationTool = createTool<
  typeof elevationParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_elevation',
  description: 'Get elevation data for locations on the earth',
  parameters: elevationParams,
  handler: async ({ locations }) => {
    const url = new URL('https://maps.googleapis.com/maps/api/elevation/json');
    const locationString = locations
      .map(loc => `${loc.latitude},${loc.longitude}`)
      .join('|');
    url.searchParams.append('locations', locationString);
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(
        `Elevation request failed: ${data.error_message || data.status}`
      );
    }
    return {
      results: data.results.map((result: any) => ({
        elevation: result.elevation,
        location: result.location,
        resolution: result.resolution,
      })),
    };
  },
});

// Directions Tool
const directionsParams = z.object({
  origin: z.string().describe('Starting point address or coordinates'),
  destination: z.string().describe('Ending point address or coordinates'),
  mode: z
    .enum(['driving', 'walking', 'bicycling', 'transit'])
    .describe('Travel mode (driving, walking, bicycling, transit)')
    .nullable(),
});

export const directionsTool = createTool<
  typeof directionsParams,
  VoiceAssistantNetworkState
>({
  name: 'maps_directions',
  description: 'Get directions between two points',
  parameters: directionsParams,
  handler: async ({ origin, destination, mode }) => {
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.append('origin', origin);
    url.searchParams.append('destination', destination);
    if (mode) {
      url.searchParams.append('mode', mode);
    }
    url.searchParams.append('key', GOOGLE_MAPS_API_KEY);
    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    if (data.status !== 'OK') {
      throw new Error(
        `Directions request failed: ${data.error_message || data.status}`
      );
    }
    return {
      routes: data.routes.map((route: any) => ({
        summary: route.summary,
        distance: route.legs[0].distance,
        duration: route.legs[0].duration,
        steps: route.legs[0].steps.map((step: any) => ({
          instructions: step.html_instructions,
          distance: step.distance,
          duration: step.duration,
          travel_mode: step.travel_mode,
        })),
      })),
    };
  },
});

export const mapsTools = [
  geocodeTool,
  reverseGeocodeTool,
  searchPlacesTool,
  placeDetailsTool,
  distanceMatrixTool,
  elevationTool,
  directionsTool,
];
