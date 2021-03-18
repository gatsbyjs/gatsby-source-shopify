import {
  generateImageData,
  IGatsbyImageHelperArgs,
  IImage,
  ImageFormat,
} from "gatsby-plugin-image";
import { ShopifyImage, urlBuilder } from "./get-shopify-image";

type ImageLayout = "constrained" | "fixed" | "fullWidth";

export async function resolveGatsbyImageData(
  image: Node & ShopifyImage,
  {
    formats = ["auto"],
    layout = "constrained",
    ...options
  }: { formats: Array<ImageFormat>; layout: ImageLayout }
) {
  let [basename] = image.originalSrc.split("?");

  const dot = basename.lastIndexOf(".");
  let ext = "";
  if (dot !== -1) {
    ext = basename.slice(dot + 1);
    basename = basename.slice(0, dot);
  }

  const generateImageSource: IGatsbyImageHelperArgs["generateImageSource"] = (
    filename,
    width,
    height,
    toFormat
  ): IImage => {
    return {
      width,
      height,
      format: toFormat,
      src: urlBuilder({
        width,
        height,
        baseUrl: filename,
        format: toFormat,
        options: {},
      }),
    };
  };
  const sourceMetadata = {
    width: image.width,
    height: image.height,
    format: ext as ImageFormat,
  };

  return generateImageData({
    ...options,
    formats,
    layout,
    sourceMetadata,
    pluginName: `gatsby-source-shopify-experimental`,
    filename: basename,
    generateImageSource,
  });
}
