"use strict";

// Nutritional database (ported from server/food_db.py).
// Values are per 100 g: [calories, protein, carbs, fat, fiber].

const FOODS = {
  // Mezeluri / lactate
  "salam": [336, 20.0, 1.0, 28.0, 0.0],
  "salam de vara": [336, 20.0, 1.0, 28.0, 0.0],
  "parizer": [290, 12.0, 3.0, 26.0, 0.0],
  "crenvursti": [290, 12.0, 2.5, 26.0, 0.0],
  "sunca": [145, 21.0, 1.5, 6.0, 0.0],
  "bacon": [541, 37.0, 1.4, 42.0, 0.0],
  "cascaval": [350, 25.0, 2.0, 27.0, 0.0],
  "telemea": [260, 17.0, 1.0, 21.0, 0.0],
  "branza de vaci": [98, 11.0, 3.4, 4.3, 0.0],
  "branza topita": [300, 12.0, 6.0, 25.0, 0.0],
  "mozzarella": [280, 22.0, 2.2, 22.0, 0.0],
  "smantana": [193, 2.5, 3.4, 19.0, 0.0],
  "unt": [717, 0.85, 0.06, 81.0, 0.0],
  "lapte": [46, 3.4, 4.9, 1.6, 0.0],
  "lapte integral": [64, 3.2, 4.8, 3.6, 0.0],
  "lapte semidegresat": [46, 3.4, 4.9, 1.6, 0.0],
  "lapte degresat": [34, 3.4, 5.0, 0.1, 0.0],
  "lapte batut": [40, 3.4, 4.0, 1.5, 0.0],
  "kefir": [51, 3.3, 4.5, 2.0, 0.0],
  "sana": [60, 3.3, 4.0, 3.6, 0.0],
  "lapte de soia": [54, 3.3, 6.0, 1.8, 0.6],
  "lapte de migdale": [17, 0.6, 0.6, 1.1, 0.2],
  "lapte de ovaz": [46, 1.0, 7.0, 1.5, 0.8],
  "lapte de cocos": [20, 0.2, 0.9, 1.9, 0.0],
  "lapte de orez": [47, 0.3, 9.2, 1.0, 0.1],
  "iaurt": [61, 3.5, 4.7, 3.3, 0.0],
  "iaurt grecesc": [59, 10.0, 3.6, 0.4, 0.0],
  "ou": [155, 13.0, 1.1, 11.0, 0.0],
  "oua": [155, 13.0, 1.1, 11.0, 0.0],

  // Paine / cereale
  "paine": [265, 9.0, 49.0, 3.2, 2.7],
  "paine alba": [265, 9.0, 49.0, 3.2, 2.7],
  "paine integrala": [247, 13.0, 41.0, 3.4, 7.0],
  "covrigi": [380, 10.0, 75.0, 4.0, 3.0],
  "biscuiti": [450, 7.0, 70.0, 16.0, 2.0],
  "cereale": [379, 7.0, 84.0, 2.5, 7.0],
  "ovaz": [389, 17.0, 66.0, 7.0, 10.0],
  "gris": [360, 12.0, 73.0, 1.0, 3.9],
  "faina": [364, 10.0, 76.0, 1.0, 2.7],

  // Garnituri / paste / orez
  "orez": [360, 7.0, 79.0, 0.9, 1.3],
  "orez fiert": [130, 2.7, 28.0, 0.3, 0.4],
  "paste": [371, 13.0, 75.0, 1.5, 3.2],
  "paste fierte": [158, 5.8, 31.0, 0.9, 1.8],
  "cartofi": [77, 2.0, 17.0, 0.1, 2.2],
  "cartofi fierti": [87, 2.0, 20.0, 0.1, 1.8],
  "cartofi prajiti": [312, 3.4, 41.0, 15.0, 3.8],
  "porumb": [86, 3.2, 19.0, 1.2, 2.7],
  "mamaliga": [85, 2.0, 18.0, 0.5, 1.5],

  // Carne / peste
  "piept de pui": [165, 31.0, 0.0, 3.6, 0.0],
  "pulpa de pui": [209, 26.0, 0.0, 11.0, 0.0],
  "carne de pui": [190, 27.0, 0.0, 8.0, 0.0],
  "carne de porc": [242, 27.0, 0.0, 14.0, 0.0],
  "carne de vita": [250, 26.0, 0.0, 15.0, 0.0],
  "carne tocata": [243, 18.0, 0.0, 18.0, 0.0],
  "somon": [208, 20.0, 0.0, 13.0, 0.0],
  "ton": [116, 26.0, 0.0, 1.0, 0.0],
  "peste": [140, 20.0, 0.0, 6.0, 0.0],

  // Legume
  "rosii": [18, 0.9, 3.9, 0.2, 1.2],
  "castravete": [15, 0.7, 3.6, 0.1, 0.5],
  "ceapa": [40, 1.1, 9.0, 0.1, 1.7],
  "morcov": [41, 0.9, 10.0, 0.2, 2.8],
  "ardei": [31, 1.0, 6.0, 0.3, 2.1],
  "broccoli": [34, 2.8, 7.0, 0.4, 2.6],
  "spanac": [23, 2.9, 3.6, 0.4, 2.2],
  "salata verde": [15, 1.4, 2.9, 0.2, 1.3],
  "varza": [25, 1.3, 6.0, 0.1, 2.5],
  "mazare": [81, 5.4, 14.0, 0.4, 5.7],
  "fasole": [127, 8.7, 23.0, 0.5, 6.4],
  "naut": [164, 8.9, 27.0, 2.6, 7.6],
  "linte": [116, 9.0, 20.0, 0.4, 7.9],
  "ciuperci": [22, 3.1, 3.3, 0.3, 1.0],
  "cartof dulce": [86, 1.6, 20.0, 0.1, 3.0],
  "avocado": [160, 2.0, 9.0, 15.0, 7.0],

  // Fructe
  "mar": [52, 0.3, 14.0, 0.2, 2.4],
  "banana": [89, 1.1, 23.0, 0.3, 2.6],
  "portocala": [47, 0.9, 12.0, 0.1, 2.4],
  "struguri": [69, 0.7, 18.0, 0.2, 0.9],
  "capsuni": [32, 0.7, 7.7, 0.3, 2.0],
  "pere": [57, 0.4, 15.0, 0.1, 3.1],
  "piersici": [39, 0.9, 10.0, 0.3, 1.5],
  "pepene": [30, 0.6, 8.0, 0.2, 0.4],
  "prune": [46, 0.7, 11.0, 0.3, 1.4],
  "cirese": [63, 1.1, 16.0, 0.2, 2.1],

  // Nuci / seminte
  "nuci": [654, 15.0, 14.0, 65.0, 6.7],
  "migdale": [579, 21.0, 22.0, 50.0, 12.5],
  "alune": [628, 15.0, 17.0, 61.0, 8.5],
  "seminte": [584, 21.0, 20.0, 51.0, 8.6],
  "chia": [486, 16.5, 42.0, 30.7, 34.4],
  "seminte chia": [486, 16.5, 42.0, 30.7, 34.4],
  "seminte in": [534, 18.3, 29.0, 42.2, 27.3],
  "seminte dovleac": [559, 30.2, 10.7, 49.1, 6.0],
  "seminte floarea soarelui": [584, 20.8, 20.0, 51.5, 8.6],

  // Grasimi / dulciuri / diverse
  "ulei": [884, 0.0, 0.0, 100.0, 0.0],
  "zahar": [387, 0.0, 100.0, 0.0, 0.0],
  "miere": [304, 0.3, 82.0, 0.0, 0.2],
  "ciocolata": [546, 4.9, 61.0, 31.0, 7.0],
  "gem": [278, 0.4, 69.0, 0.1, 1.1],
  "pizza": [266, 11.0, 33.0, 10.0, 2.3],
  "cartofi pai": [312, 3.4, 41.0, 15.0, 3.8],

  // Bauturi
  "bere": [43, 0.5, 3.6, 0.0, 0.0],
  "vin": [83, 0.1, 2.6, 0.0, 0.0],
  "cola": [42, 0.0, 10.6, 0.0, 0.0],
  "suc": [46, 0.1, 11.0, 0.0, 0.1],
  "cafea": [2, 0.1, 0.0, 0.0, 0.0],
  "apa": [0, 0.0, 0.0, 0.0, 0.0],
};

// Default grams for one "piece" (buc / felie / bucata) when relevant.
const PIECE_GRAMS = {
  "ou": 50,
  "oua": 50,
  "paine": 30,
  "paine alba": 30,
  "paine integrala": 30,
  "mar": 180,
  "banana": 120,
  "portocala": 130,
  "covrigi": 60,
  "biscuiti": 8,
  "pizza": 120,
};

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function macrosFor(name, grams) {
  const [cal, prot, carb, fat, fib] = FOODS[name];
  const f = grams / 100.0;
  return {
    calories: round1(cal * f),
    protein: round1(prot * f),
    carbs: round1(carb * f),
    fat: round1(fat * f),
    fiber: round1(fib * f),
  };
}

function scalePer100(per100, grams) {
  let cal, prot, carb, fat, fib;
  if (Array.isArray(per100)) {
    [cal, prot, carb, fat, fib] = per100;
  } else {
    cal = per100.calories || 0;
    prot = per100.protein || 0;
    carb = per100.carbs || 0;
    fat = per100.fat || 0;
    fib = per100.fiber || 0;
  }
  const f = grams / 100.0;
  return {
    calories: round1(cal * f),
    protein: round1(prot * f),
    carbs: round1(carb * f),
    fat: round1(fat * f),
    fiber: round1(fib * f),
  };
}
