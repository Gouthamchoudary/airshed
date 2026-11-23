export type AirSource = 'live' | 'cached' | 'demo';
export type DataMode = 'live' | 'demo';
export type Household = 'family' | 'adults' | 'sensitive' | 'seniors';
export type Commute = 'car' | 'transit' | 'walk' | 'cycle';
export type ActionGroup = 'Routine' | 'Indoors' | 'Community';

export interface City {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  region?: string;
  admin1?: string;
  timezone?: string;
}

export interface Profile {
  household: Household;
  commute: Commute;
  distanceKm: number;
}

export interface AirHour {
  time: string;
  aqi: number;
  pm25: number;
}

export interface AirCategory {
  label: string;
  color: string;
}

export interface AirForecast {
  city: City;
  source: AirSource;
  asOf: string;
  timezone: string;
  aqi: number;
  pm25: number;
  pm10: number;
  hours: AirHour[];
  category: AirCategory;
  scenarioReason?: string;
}

export interface Citation {
  title: string;
  url: string;
}

export interface Grounding {
  title: string;
  action: string;
  impact: string;
}

export interface Action extends Grounding {
  id: string;
  group: ActionGroup;
  sourceUrl: string;
  sourceTitle: string;
}

export interface BriefRequest {
  question: string;
  city: string;
  aqi: number;
  source: AirSource;
  household: Household;
  commute: Commute;
  actions: Grounding[];
}

export interface Rewrite {
  text: string;
  mode: 'cloud' | 'nano';
  label: string;
}

export interface Answer {
  text: string;
  mode: 'cloud' | 'nano' | 'local' | 'guide';
  label: string;
  sources: Citation[];
}

export interface AssistantOptions {
  cloud?: boolean;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}
