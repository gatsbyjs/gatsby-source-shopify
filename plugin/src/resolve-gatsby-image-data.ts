import {
  generateImageData,
  getLowResolutionImageURL,
  IGatsbyImageHelperArgs,
  IImage,
  ImageFormat,
} from "gatsby-plugin-image";
import fetch from "node-fetch"
import { ShopifyImage, urlBuilder } from "./get-shopify-image";

type ImageLayout = "constrained" | "fixed" | "fullWidth";

type IImageWithPlaceholder = IImage & {
  placeholder: string
}

async function getImageBase64({ imageAddress }: { imageAddress: string }): Promise<string> {
  const response = await fetch(imageAddress)
  const buffer = await response.buffer();
  return buffer.toString(`base64`)
}

/**
 * Download and generate a low-resolution placeholder
 * 
 * @param lowResImageFile
 */
function getBase64DataURI({ imageBase64 }: { imageBase64: string }) {
  return `data:image/png;base64,${imageBase64}`
}

export async function resolveGatsbyImageData(
  image: Node & ShopifyImage,
  {
    formats = ["auto"],
    layout = "constrained",
    ...options
  }: { formats: Array<ImageFormat>; layout: ImageLayout }
) {
  const remainingOptions = options as Record<string, any>;
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
  ): IImageWithPlaceholder => {
    return {
      width,
      height,
      placeholder: ``,
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

  

  if (remainingOptions && remainingOptions.placeholder === "BLURRED") {
    // This function returns the URL for a 20px-wide image, to use as a blurred placeholder
    const lowResImageURL = getLowResolutionImageURL({
      ...remainingOptions,
      formats,
      layout,
      sourceMetadata,
      pluginName: `gatsby-source-shopify-experimental`,
      filename: image.originalSrc,
      generateImageSource,
    })
    const imageBase64 = await getImageBase64({
      imageAddress: lowResImageURL,
    })
    
    // This would be your own function to download and generate a low-resolution placeholder
    remainingOptions.placeholderURL =  await getBase64DataURI({
      imageBase64,
    })
  }
  return generateImageData({
    ...remainingOptions,
    formats,
    layout,
    sourceMetadata,
    pluginName: `gatsby-source-shopify-experimental`,
    filename: image.originalSrc,
    generateImageSource,
  });
}
