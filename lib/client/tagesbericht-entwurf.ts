export const TAGESBERICHT_ENTWURF_VERSION = 1 as const;

export interface EntwurfPersonalZeile {
  name: string;
  stunden: string;
  taetigkeit: string;
}

export interface EntwurfMaterialZeile {
  bezeichnung: string;
  menge: string;
  typ: "material" | "geraet";
}

export interface TagesberichtEntwurfInhalt {
  baustelle_id: string;
  datum: string;
  wetter: string;
  stichpunkte: string;
  personal: EntwurfPersonalZeile[];
  material: EntwurfMaterialZeile[];
}

export interface Tages