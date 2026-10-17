/* LK Power Outage Tracker — all 25 districts of Sri Lanka (namespace: LKPM.districts)
   Centroids are approximate district midpoints; `weight` roughly mirrors population
   share and is only used to make demo-mode data look realistic. */
(function (ns) {
  'use strict';

  var LIST = [
    { name: 'Ampara',        lat: 7.2965,  lng: 81.6756, weight: 3,  areas: ['Ampara', 'Kalmunai', 'Sammanthurai', 'Akkaraipattu', 'Uhana', 'Nintavur'] },
    { name: 'Anuradhapura',  lat: 8.3356,  lng: 80.3956, weight: 3,  areas: ['Anuradhapura', 'Kekirawa', 'Thambuttegama', 'Medawachchiya', 'Galenbindunuwewa'] },
    { name: 'Badulla',       lat: 6.9934,  lng: 81.0550, weight: 3,  areas: ['Badulla', 'Bandarawela', 'Hali-Ela', 'Passara', 'Welimada', 'Ella'] },
    { name: 'Batticaloa',    lat: 7.7170,  lng: 81.7000, weight: 3,  areas: ['Batticaloa', 'Eravur', 'Kattankudy', 'Valaichchenai', 'Chenkaladi'] },
    { name: 'Colombo',       lat: 6.9271,  lng: 79.8612, weight: 10, areas: ['Colombo 03', 'Colombo 07', 'Nugegoda', 'Maharagama', 'Dehiwala', 'Moratuwa', 'Kolonnawa', 'Kottawa', 'Battaramulla', 'Borella', 'Piliyandala'] },
    { name: 'Galle',         lat: 6.0535,  lng: 80.2210, weight: 4,  areas: ['Galle', 'Hikkaduwa', 'Ambalangoda', 'Elpitiya', 'Karapitiya', 'Baddegama'] },
    { name: 'Gampaha',       lat: 7.0917,  lng: 79.9990, weight: 8,  areas: ['Negombo', 'Gampaha', 'Kadawatha', 'Wattala', 'Ja-Ela', 'Kelaniya', 'Seeduwa', 'Minuwangoda'] },
    { name: 'Hambantota',    lat: 6.1429,  lng: 81.1212, weight: 3,  areas: ['Hambantota', 'Tangalle', 'Tissamaharama', 'Ambalantota', 'Ranna'] },
    { name: 'Jaffna',        lat: 9.6615,  lng: 80.0255, weight: 4,  areas: ['Jaffna', 'Nallur', 'Chavakachcheri', 'Point Pedro', 'Velvettithurai', 'Chunnakam'] },
    { name: 'Kalutara',      lat: 6.5854,  lng: 79.9607, weight: 4,  areas: ['Kalutara', 'Panadura', 'Horana', 'Beruwala', 'Matugama', 'Aluthgama'] },
    { name: 'Kandy',         lat: 7.2906,  lng: 80.6337, weight: 5,  areas: ['Kandy', 'Peradeniya', 'Katugastota', 'Gampola', 'Kadugannawa', 'Digana'] },
    { name: 'Kegalle',       lat: 7.2513,  lng: 80.3464, weight: 3,  areas: ['Kegalle', 'Mawanella', 'Rambukkana', 'Warakapola', 'Dehiowita'] },
    { name: 'Kilinochchi',   lat: 9.3803,  lng: 80.4000, weight: 1,  areas: ['Kilinochchi', 'Paranthan', 'Poonakary', 'Iranai'] },
    { name: 'Kurunegala',    lat: 7.4863,  lng: 80.3623, weight: 5,  areas: ['Kurunegala', 'Kuliyapitiya', 'Narammala', 'Nikaweratiya', 'Polgahawela', 'Mawathagama'] },
    { name: 'Mannar',        lat: 8.9810,  lng: 79.9044, weight: 1,  areas: ['Mannar', 'Nanattan', 'Pesalai', 'Murunkan'] },
    { name: 'Matale',        lat: 7.4675,  lng: 80.6374, weight: 2,  areas: ['Matale', 'Dambulla', 'Rattota', 'Ukuwela', 'Galewela'] },
    { name: 'Matara',        lat: 5.9549,  lng: 80.5550, weight: 4,  areas: ['Matara', 'Weligama', 'Akuressa', 'Deniyaya', 'Hakmana', 'Pitabeddara'] },
    { name: 'Moneragala',    lat: 6.8728,  lng: 81.3500, weight: 2,  areas: ['Moneragala', 'Wellawaya', 'Bibile', 'Buttala', 'Madulla'] },
    { name: 'Mullaitivu',    lat: 9.2671,  lng: 80.8142, weight: 1,  areas: ['Mullaitivu', 'Oddusuddan', 'Puthukkudiyiruppu', 'Nedunkeni'] },
    { name: 'Nuwara Eliya',  lat: 6.9497,  lng: 80.7891, weight: 2,  areas: ['Nuwara Eliya', 'Hatton', 'Talawakele', 'Walapane', 'Ginigathhena'] },
    { name: 'Polonnaruwa',   lat: 7.9403,  lng: 81.0188, weight: 2,  areas: ['Polonnaruwa', 'Hingurakgoda', 'Medirigiriya', 'Kaduruwela', 'Welikanda'] },
    { name: 'Puttalam',      lat: 8.0362,  lng: 79.8283, weight: 3,  areas: ['Puttalam', 'Chilaw', 'Wennappuwa', 'Nattandiya', 'Anamaduwa', 'Marawila'] },
    { name: 'Ratnapura',     lat: 6.6828,  lng: 80.3992, weight: 3,  areas: ['Ratnapura', 'Embilipitiya', 'Balangoda', 'Pelmadulla', 'Kuruwita', 'Awissawella'] },
    { name: 'Trincomalee',   lat: 8.5874,  lng: 81.2152, weight: 3,  areas: ['Trincomalee', 'Kinniya', 'Kantale', 'Mutur', 'Nilaveli'] },
    { name: 'Vavuniya',      lat: 8.7514,  lng: 80.4971, weight: 1,  areas: ['Vavuniya', 'Nedunkeni', 'Cheddikulam', 'Omanthai'] }
  ];

  /* approx. bounding box of Sri Lanka incl. Jaffna peninsula */
  var SL_BOUNDS = { minLat: 5.72, maxLat: 10.05, minLng: 79.25, maxLng: 82.15 };

  function inSriLanka(lat, lng) {
    return lat >= SL_BOUNDS.minLat && lat <= SL_BOUNDS.maxLat &&
           lng >= SL_BOUNDS.minLng && lng <= SL_BOUNDS.maxLng;
  }

  var util = ns.util;
  function nearest(lat, lng) {
    var best = null, bestKm = Infinity;
    LIST.forEach(function (d) {
      var km = util.haversineKm(lat, lng, d.lat, d.lng);
      if (km < bestKm) { bestKm = km; best = d; }
    });
    return best ? { name: best.name, km: Math.round(bestKm) } : null;
  }

  ns.districts = { list: LIST, names: LIST.map(function (d) { return d.name; }), inSriLanka: inSriLanka, nearest: nearest, bounds: SL_BOUNDS };
})(window.LKPM = window.LKPM || {});
