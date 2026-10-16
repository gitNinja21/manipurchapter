// Transcribed and visually verified against the owner's menu mc.pdf (October 2026).
// Stable IDs and saved item snapshots ensure later menu edits cannot rewrite old sales.
export type MenuItem={id:string;name:string;category:string;diet:"VEG"|"NON_VEG"|"CHOICE";price:number};
const sections: [string,MenuItem["diet"],[string,number][]][]=[
 ["Tangkhul thali","NON_VEG",[
 ["Tangkhul Pork Jumbo Feast Thali",585],["Tangkhul Mixed Thali",525],["Tangkhul Smoked Pork Thali",435],["Tangkhul Pork Thali",375],["Tangkhul Smoked Chicken Thali",385],["Tangkhul Chicken Thali",345],["Tangkhul Home Style Fish Thali",335]]],
 ["Tangkhul à la carte","NON_VEG",[
 ["Tangkhul Naga Pork Curry",325],["Tangkhul Naga Kahathur Pork Curry",345],["Tangkhul Naga Kahathur Akao Smoked Pork Curry",395],["Tangkhul Naga Kahathur Chicken Curry",315],["Tangkhul Naga Chicken Curry",295],["Fried Pork",275],["Chicken Salad in Longpi Chilli Oil",200],["Chicken Salad Home-Style with Local Herbs",200],["Chicken Liver and Gizzard Salad",200],["Fish Home-Style with Turmeric from Grihang Hills",295],["Red Beans (Rajma) with Dry Fish",160]]],
 ["Tangkhul veg","VEG",[["Dal - Plain Yellow Dal home-style",120],["Kanghou - French Beans, Carrots and Potatoes",80],["King Chilli Chutney with Tomato",95],["Shomri Chutney",65]]],
 ["Mini meals","NON_VEG",[["Mini Meal Chicken",185],["Mini Meal Smoked Chicken",225],["Mini Meal Pork",225],["Mini Meal Smoked Pork",255]]],
 ["Meitei thali","NON_VEG",[["Meitei Duck Thali",475],["Meitei Fish Thali",395]]],
 ["Meitei thali","VEG",[["Meitei Veg Thali Paneer",355],["Meitei Veg Thali Regular",315]]],
 ["Rice","VEG",[["Rice (small)",50],["Rice (big)",100]]],
 ["Meitei non-veg","NON_VEG",[["Ngaringkha Ngouba",70],["Nga Ataoba Thongba",250],["Nga Atoiba Thongba",300],["Sareng Thongba",415],["Tharoi Thongba - Spicy Snail Curry",190],["Nga Ataoba - Fried Fish",90]]],
 ["Meitei veg","VEG",[["Kanghou - Bitter Gourd, Brinjal, Peanuts",60],["Mairongbi Thongba - Arhar Dal",120],["Pakora Thongba",150],["Ooti Angouba",120],["Ooti Asangba",140],["Gobi Saag",60],["Paneer Thongba",175],["Aloo Gobi Saag",90],["Khechri",125],["Khechri Platter",195]]],
 ["Snacks","VEG",[["Bora - Fritters",165],["Aloo Chop",115]]],
 ["Snacks","CHOICE",[["Singju (Small)",80],["Singju (Large)",150]]],
 ["Beverages","VEG",[["Bottled Water (0.5 litre)",15],["Bottled Water (1 litre)",30],["Fruit Beer",180],["Kombucha",160],["Milk Tea",70],["Red Tea",50],["Roselle Tea",80],["Heimang Tea",80],["Buckwheat Tea",80],["Green Tea",60],["Lemon Soda",100],["Lemon Water",100],["Heimang Iced Tea",145],["Mocktail Strawberry Bleu",190],["Mocktail Blue Lagoon",175],["Mocktail Virgin Mojito",150]]],
];
export const MENU:MenuItem[]=sections.flatMap(([category,diet,items])=>items.map(([name,price])=>({id:name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,""),name,price,category,diet})));
