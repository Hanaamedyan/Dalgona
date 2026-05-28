// netlify/functions/reviews.js
// ─────────────────────────────────────────────────────────────────────────────
// Proxies Google Places API so the API key is never exposed in the browser.
//
// Required environment variables (set in Netlify dashboard → Site config → Env):
//   GOOGLE_PLACES_API_KEY   — your Google Cloud API key (Places API enabled)
//   GOOGLE_PLACE_ID         — the Place ID for Dalgona Bakeri
//
// How to find the Place ID:
//   1. Go to https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
//   2. Search "Dalgona Bakeri Trondheim"
//   3. Copy the Place ID shown (starts with "ChIJ…")
//
// The response is cached for 1 hour via Netlify's CDN (Cache-Control header).
// ─────────────────────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
  const ALLOWED_ORIGINS = ["https://dalgona.netlify.app", "http://localhost:8888"];
  const origin = event.headers.origin || "";
  const corsHeader = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsHeader,
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
  };

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  const API_KEY  = process.env.GOOGLE_PLACES_API_KEY;
  const PLACE_ID = process.env.GOOGLE_PLACE_ID;

  if (!API_KEY || !PLACE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server is missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID env vars." }),
    };
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(PLACE_ID)}` +
    `&fields=rating,user_ratings_total,reviews` +
    `&reviews_sort=newest` +
    `&language=no` +
    `&key=${API_KEY}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: `Google API returned status: ${data.status}` }),
      };
    }

    const { rating, user_ratings_total, reviews = [] } = data.result;

    // Return only what the frontend needs — never forward the raw API response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        rating,
        total: user_ratings_total,
        reviews: reviews.slice(0, 5).map((r) => ({
          author:  r.author_name,
          rating:  r.rating,
          text:    r.text,
          time:    r.relative_time_description, // e.g. "3 uker siden"
          photo:   r.profile_photo_url || null,
        })),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
