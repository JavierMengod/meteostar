// leaflet.markercluster se engancha a la variable global L de Leaflet: hay que definirla antes de importarlo.
import L from "leaflet";

(globalThis as unknown as { L: typeof L }).L = L;
