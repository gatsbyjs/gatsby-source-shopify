import {
  generateImageData,
  IGatsbyImageHelperArgs,
  IImage,
  ImageFormat,
} from "gatsby-plugin-image";

const validFormats = new Set(["jpg", "png", "webp"]);
type ImageLayout = "constrained" | "fixed" | "fullWidth";

export async function resolveGatsbyImageData(
  image: Node & { width: number; height: number; originalSrc: string },
  {
    formats = ["auto", "webp"],
    layout = "constrained",
    ...options
  }: { formats: Array<ImageFormat>; layout: ImageLayout }
) {
  let [basename, version] = image.originalSrc.split("?");

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
    if (!validFormats.has(toFormat)) {
      console.warn(
        `${toFormat} is not a valid format. Valid formats are: ${[
          ...validFormats,
        ].join(", ")}`
      );
      toFormat = "jpg";
    }
    let suffix = "";
    if (toFormat === ext) {
      suffix = `.${toFormat}`;
    } else {
      suffix = `.${ext}.${toFormat}`;
    }

    return {
      width,
      height,
      format: toFormat,
      src: `${filename}_${width}x${height}_crop_center${suffix}?${version}`,
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
