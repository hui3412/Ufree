// Public Québec CEGEPs with verified student Omnivox portals. See data/cegep-sources.json.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UFreeSchools = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const schools = [
  {
    "id": "collegeahuntsic",
    "name": "Collège Ahuntsic",
    "region": "Montréal",
    "aliases": [
      "Cégep d’Ahuntsic"
    ]
  },
  {
    "id": "cmaisonneuve",
    "name": "Collège de Maisonneuve",
    "region": "Montréal",
    "aliases": [
      "Cégep de Maisonneuve"
    ]
  },
  {
    "id": "claurendeau",
    "name": "Cégep André-Laurendeau",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "cegepba",
    "name": "Cégep Beauce-Appalaches",
    "region": "Chaudière-Appalaches",
    "aliases": []
  },
  {
    "id": "champlaincollege-st-lawrence",
    "name": "Cégep Champlain – Campus Saint-Lawrence",
    "region": "Capitale-Nationale",
    "aliases": []
  },
  {
    "id": "champlaincollege-lennoxville",
    "name": "Cégep Champlain – Lennoxville",
    "region": "Estrie",
    "aliases": []
  },
  {
    "id": "champlaincollege-st-lambert",
    "name": "Cégep Champlain – Saint-Lambert",
    "region": "Montérégie",
    "aliases": []
  },
  {
    "id": "cegepgarneau",
    "name": "Cégep Garneau",
    "region": "Capitale-Nationale",
    "aliases": []
  },
  {
    "id": "cgodin",
    "name": "Cégep Gérald-Godin",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "cegep-heritage",
    "name": "Cégep Heritage College",
    "region": "Outaouais",
    "aliases": [
      "Collège Héritage"
    ]
  },
  {
    "id": "climoilou",
    "name": "Cégep Limoilou",
    "region": "Capitale-Nationale",
    "aliases": []
  },
  {
    "id": "collegemv",
    "name": "Cégep Marie-Victorin",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "cstjean",
    "name": "Cégep Saint-Jean-sur-Richelieu",
    "region": "Montérégie",
    "aliases": []
  },
  {
    "id": "cegep-baie-comeau",
    "name": "Cégep de Baie-Comeau",
    "region": "Côte-Nord",
    "aliases": []
  },
  {
    "id": "bdeb",
    "name": "Cégep de Bois-de-Boulogne",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "cchic",
    "name": "Cégep de Chicoutimi",
    "region": "Saguenay–Lac-Saint-Jean",
    "aliases": []
  },
  {
    "id": "cegepdrummond",
    "name": "Cégep de Drummondville",
    "region": "Centre-du-Québec",
    "aliases": []
  },
  {
    "id": "cegepgranby",
    "name": "Cégep de Granby",
    "region": "Estrie",
    "aliases": []
  },
  {
    "id": "cegeplevis",
    "name": "Cégep de Lévis",
    "region": "Chaudière-Appalaches",
    "aliases": []
  },
  {
    "id": "cegep-matane",
    "name": "Cégep de Matane",
    "region": "Bas-Saint-Laurent",
    "aliases": []
  },
  {
    "id": "cegep-rimouski",
    "name": "Cégep de Rimouski",
    "region": "Bas-Saint-Laurent",
    "aliases": []
  },
  {
    "id": "cegeprdl",
    "name": "Cégep de Rivière-du-Loup",
    "region": "Bas-Saint-Laurent",
    "aliases": []
  },
  {
    "id": "crosemont",
    "name": "Cégep de Rosemont",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "cegepsth",
    "name": "Cégep de Saint-Hyacinthe",
    "region": "Montérégie",
    "aliases": [
      "Cégep de St-Hyacinthe"
    ]
  },
  {
    "id": "cstj",
    "name": "Cégep de Saint-Jérôme",
    "region": "Laurentides",
    "aliases": []
  },
  {
    "id": "cegep-st-laurent",
    "name": "Cégep de Saint-Laurent",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "csfoy",
    "name": "Cégep de Sainte-Foy",
    "region": "Capitale-Nationale",
    "aliases": []
  },
  {
    "id": "cegep-sept-iles",
    "name": "Cégep de Sept-Îles",
    "region": "Côte-Nord",
    "aliases": []
  },
  {
    "id": "cshawi",
    "name": "Cégep de Shawinigan",
    "region": "Mauricie",
    "aliases": []
  },
  {
    "id": "cegepsherbrooke",
    "name": "Cégep de Sherbrooke",
    "region": "Estrie",
    "aliases": []
  },
  {
    "id": "cegepst",
    "name": "Cégep de Sorel-Tracy",
    "region": "Montérégie",
    "aliases": []
  },
  {
    "id": "cegepth",
    "name": "Cégep de Thetford",
    "region": "Chaudière-Appalaches",
    "aliases": []
  },
  {
    "id": "cegeptr",
    "name": "Cégep de Trois-Rivières",
    "region": "Mauricie",
    "aliases": []
  },
  {
    "id": "colval",
    "name": "Cégep de Valleyfield",
    "region": "Montérégie",
    "aliases": []
  },
  {
    "id": "cegepvicto",
    "name": "Cégep de Victoriaville",
    "region": "Centre-du-Québec",
    "aliases": []
  },
  {
    "id": "cegepgim",
    "name": "Cégep de la Gaspésie et des Îles",
    "region": "Gaspésie–Îles-de-la-Madeleine",
    "aliases": []
  },
  {
    "id": "cegepat",
    "name": "Cégep de l’Abitibi-Témiscamingue",
    "region": "Abitibi-Témiscamingue",
    "aliases": []
  },
  {
    "id": "cegepoutaouais",
    "name": "Cégep de l’Outaouais",
    "region": "Outaouais",
    "aliases": []
  },
  {
    "id": "cvm",
    "name": "Cégep du Vieux Montréal",
    "region": "Montréal",
    "aliases": [
      "Cégep du Vieux Montréal"
    ]
  },
  {
    "id": "cegep-lanaudiere-joliette",
    "name": "Cégep régional de Lanaudière à Joliette",
    "region": "Lanaudière",
    "aliases": []
  },
  {
    "id": "cegep-lanaudiere-assomption",
    "name": "Cégep régional de Lanaudière à L’Assomption",
    "region": "Lanaudière",
    "aliases": []
  },
  {
    "id": "cegep-lanaudiere-terrebonne",
    "name": "Cégep régional de Lanaudière à Terrebonne",
    "region": "Lanaudière",
    "aliases": []
  },
  {
    "id": "cegepmontpetit",
    "name": "Cégep Édouard-Montpetit",
    "region": "Montérégie",
    "aliases": [
      "Cégep Édouard Montpetit"
    ]
  },
  {
    "id": "dawsoncollege",
    "name": "Dawson College",
    "region": "Montréal",
    "aliases": [
      "Collège Dawson"
    ]
  },
  {
    "id": "johnabbott",
    "name": "John Abbott College",
    "region": "Montréal",
    "aliases": [
      "Cégep John Abbott"
    ]
  },
  {
    "id": "vaniercollege",
    "name": "Vanier College",
    "region": "Montréal",
    "aliases": [
      "Cégep Vanier"
    ]
  }
];
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const school of schools) { Object.freeze(school.aliases); Object.freeze(school); }
  Object.freeze(schools);
  const find = id => schools.find(school => school.id === id);
  const search = query => {
    const words = normalize(query).split(" ").filter(Boolean);
    return schools.filter(school => {
      const haystack = normalize([school.name, school.region, ...school.aliases].join(" "));
      return words.every(word => haystack.includes(word));
    });
  };
  return Object.freeze({schools, find, search});
});
