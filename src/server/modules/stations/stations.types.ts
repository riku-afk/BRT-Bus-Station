export type StationRow = {
  id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  is_active: boolean;
};

/** Station as the API returns it. `distanceMeters` is measured along the route from the first active station. */
export type StationView = {
  id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  isActive: boolean;
  distanceMeters: number;
};
