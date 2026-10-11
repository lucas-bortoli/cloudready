import pictureGlobe from "./charlesdeluvio-RDjZh9dqlP4-unsplash.jpg";
import PICTURE_FALLBACK from "./fallback-picture.png";
import pictureCup from "./mae-mu-GnWKTJlMYsQ-unsplash.jpg";
import pictureCone from "./mae-mu-Rz5o0osnN6Q-unsplash.jpg";
import pictureCherry from "./mae-mu-vbAEHCrvXZ0-unsplash.jpg";
import pictureLeaf from "./mae-mu-XsnGSAOe-pE-unsplash.jpg";

const DEFAULT_PICTURES = {
  globe: pictureGlobe,
  cup: pictureCup,
  cone: pictureCone,
  cherry: pictureCherry,
  leaf: pictureLeaf,
};

export type DefaultPictureKey = keyof typeof DEFAULT_PICTURES;
export default DEFAULT_PICTURES;
export { PICTURE_FALLBACK };
