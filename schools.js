// Québec CEGEPs and public/private colleges with verified student Omnivox portals. See data/cegep-sources.json.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UFreeSchools = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const schools = [
  {
    "id": "cndf",
    "name": "Campus Notre-Dame-de-Foy",
    "region": "Capitale-Nationale",
    "aliases": [
      "CNDF",
      "Collège Notre-Dame-de-Foy",
      "Collège BCM"
    ]
  },
  {
    "id": "cargair",
    "name": "Cargair",
    "region": "Montérégie",
    "aliases": [
      "Cargair Ltée",
      "Académie de vol Cargair"
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
    "id": "cegeplevis",
    "name": "Cégep de Lévis",
    "region": "Chaudière-Appalaches",
    "aliases": []
  },
  {
    "id": "cegepoutaouais",
    "name": "Cégep de l’Outaouais",
    "region": "Outaouais",
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
    "id": "cvm",
    "name": "Cégep du Vieux Montréal",
    "region": "Montréal",
    "aliases": [
      "Cégep du Vieux Montréal"
    ]
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
    "id": "cstjean",
    "name": "Cégep Saint-Jean-sur-Richelieu",
    "region": "Montérégie",
    "aliases": []
  },
  {
    "id": "collegeahuntsic",
    "name": "Collège Ahuntsic",
    "region": "Montréal",
    "aliases": [
      "Cégep d’Ahuntsic"
    ]
  },
  {
    "id": "airrichelieu",
    "name": "Collège Air Richelieu",
    "region": "Montérégie",
    "aliases": []
  },
  {
    "id": "grasset",
    "name": "Collège André-Grasset",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "collegeavalon",
    "name": "Collège Avalon",
    "region": "Capitale-Nationale et Montréal",
    "aliases": [
      "Avalon College"
    ]
  },
  {
    "id": "bart",
    "name": "Collège Bart",
    "region": "Capitale-Nationale",
    "aliases": []
  },
  {
    "id": "collegecanada",
    "name": "Collège Canada",
    "region": "Montréal, Estrie et Outaouais",
    "aliases": [
      "Canada College"
    ]
  },
  {
    "id": "academyofaeronautics",
    "name": "Collège d’aéronautique",
    "region": "Montréal",
    "aliases": [
      "Academy of Aeronautics"
    ]
  },
  {
    "id": "matrixcollege",
    "name": "Collège de gestion, technologie et santé Matrix inc.",
    "region": "Montréal",
    "aliases": [
      "Matrix College",
      "Collège Matrix"
    ]
  },
  {
    "id": "collegeimmobilier",
    "name": "Collège de l’immobilier du Québec",
    "region": "Montréal",
    "aliases": []
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
    "id": "collegedecarie",
    "name": "Collège Décarie",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "cei",
    "name": "Collège d’enseignement en immobilier inc.",
    "region": "Montréal",
    "aliases": [
      "Collège CEI"
    ]
  },
  {
    "id": "montrealcollege",
    "name": "Collège des Technologies de l'Information de Montréal",
    "region": "Montréal",
    "aliases": [
      "Montreal College of Information Technology",
      "MCIT"
    ]
  },
  {
    "id": "ellis",
    "name": "Collège Ellis",
    "region": "Centre-du-Québec, Mauricie et Montérégie",
    "aliases": [
      "Collège Ellis Drummondville",
      "Collège Ellis Trois-Rivières",
      "Collège Ellis Longueuil"
    ]
  },
  {
    "id": "brebeuf",
    "name": "Collège Jean-de-Brébeuf",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "kensleycollege",
    "name": "Collège Kensley",
    "region": "Montréal",
    "aliases": [
      "Kensley College"
    ]
  },
  {
    "id": "clafleche",
    "name": "Collège Laflèche",
    "region": "Mauricie",
    "aliases": []
  },
  {
    "id": "collegelasalle",
    "name": "Collège LaSalle",
    "region": "Montréal et Laval",
    "aliases": [
      "LaSalle College",
      "Collège LaSalle Montréal",
      "Collège LaSalle Laval"
    ]
  },
  {
    "id": "cmrsj-rmcsj",
    "name": "Collège militaire royal de Saint-Jean",
    "region": "Montérégie",
    "aliases": [
      "Royal Military College Saint-Jean",
      "CMR Saint-Jean",
      "RMC Saint-Jean"
    ]
  },
  {
    "id": "collegemultihexa",
    "name": "Collège Multihexa",
    "region": "Saguenay–Lac-Saint-Jean",
    "aliases": []
  },
  {
    "id": "collegenational",
    "name": "Collège national de science et technologie inc.",
    "region": "Montréal",
    "aliases": [
      "College National of Science and Technology"
    ]
  },
  {
    "id": "osullivan",
    "name": "Collège O’Sullivan de Montréal",
    "region": "Montréal",
    "aliases": [
      "O'Sullivan College of Montreal"
    ]
  },
  {
    "id": "collegest-michel",
    "name": "Collège St-Michel, Pavillon Sauvé",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "tav",
    "name": "Collège TAV",
    "region": "Montréal",
    "aliases": [
      "TAV College"
    ]
  },
  {
    "id": "collegeuniversel",
    "name": "Collège Universel",
    "region": "Estrie, Montréal et Outaouais",
    "aliases": [
      "Collège Universel Gatineau",
      "Collège Universel Montréal",
      "Collège Universel Sherbrooke"
    ]
  },
  {
    "id": "sainteanne",
    "name": "Collégial international Sainte-Anne",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "conservatoire",
    "name": "Conservatoire de musique et d’art dramatique du Québec",
    "region": "Plusieurs régions du Québec",
    "aliases": [
      "Conservatoire de musique de Val-d’Or",
      "Conservatoire de musique de Rimouski",
      "Conservatoire de musique de Québec",
      "Conservatoire de musique de Trois-Rivières",
      "Conservatoire de musique de Montréal",
      "Conservatoire de musique de Gatineau",
      "Conservatoire de musique de Saguenay",
      "Abitibi-Témiscamingue",
      "Bas-Saint-Laurent",
      "Capitale-Nationale",
      "Mauricie",
      "Montréal",
      "Outaouais",
      "Saguenay–Lac-Saint-Jean",
      "CMADQ"
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
    "id": "em-insa",
    "name": "École de management INSA",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "ecolenationaledecirque",
    "name": "École nationale de cirque",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "enh",
    "name": "École nationale de l’humour",
    "region": "Montréal",
    "aliases": []
  },
  {
    "id": "esidem",
    "name": "École Supérieure Internationale de Montréal",
    "region": "Montréal",
    "aliases": [
      "ESIDEM"
    ]
  },
  {
    "id": "itaq",
    "name": "Institut de technologie agroalimentaire du Québec",
    "region": "Bas-Saint-Laurent et Montérégie",
    "aliases": [
      "ITAQ",
      "ITA",
      "Campus de La Pocatière",
      "Campus de Saint-Hyacinthe"
    ]
  },
  {
    "id": "teccart",
    "name": "Institut Teccart",
    "region": "Montréal et Montérégie",
    "aliases": []
  },
  {
    "id": "isartdigital",
    "name": "ISART Digital Montréal",
    "region": "Montréal",
    "aliases": [
      "Isart Digital"
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
    "id": "marianopolis",
    "name": "Marianopolis College",
    "region": "Montréal",
    "aliases": [
      "Collège Marianopolis",
      "Marinopolis",
      "Marianopolis"
    ]
  },
  {
    "id": "college-merici",
    "name": "Mérici Collégial Privé",
    "region": "Capitale-Nationale",
    "aliases": [
      "Collège Mérici",
      "Mérici Collégial Privé"
    ]
  },
  {
    "id": "seminaire-sherbrooke",
    "name": "Séminaire de Sherbrooke",
    "region": "Estrie",
    "aliases": []
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
