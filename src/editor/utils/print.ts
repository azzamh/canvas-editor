import { PaperDirection } from '../dataset/enum/Editor'
import { jsPDF } from 'jspdf'

function convertPxToPaperSize(width: number, height: number) {
  if (width === 1125 && height === 1593) {
    return {
      size: 'a3',
      width: '297mm',
      height: '420mm'
    }
  }
  if (width === 794 && height === 1123) {
    return {
      size: 'a4',
      width: '210mm',
      height: '297mm'
    }
  }
  if (width === 565 && height === 796) {
    return {
      size: 'a5',
      width: '148mm',
      height: '210mm'
    }
  }
  // 其他默认不转换
  return {
    size: '',
    width: `${width}px`,
    height: `${height}px`
  }
}

export interface IPrintImageBase64Option {
  width: number
  height: number
  direction?: PaperDirection
}

/**
 * Re-encode a base64 image as JPEG at quality=1.0 (max) without resizing.
 * This minimizes any potential blur or quality loss.
 */
async function reencodeAsJpegNoResize(
  base64: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Cannot get canvas 2D context'))
        return
      }

      // Draw the image at its original size
      ctx.drawImage(img, 0, 0, img.width, img.height)

      // Convert to JPEG with quality=1.0 (minimal or no visible compression artifacts)
      const jpegBase64 = canvas.toDataURL('image/jpeg', 0.5)
      resolve(jpegBase64)
    }
    img.onerror = reject
    img.src = base64
  })
}

/**
 * Process array items in chunks
 * @param array Array to process
 * @param chunkSize Size of each chunk
 * @param processor Function to process each chunk
 */
async function processInChunks<T, R>(
  array: T[],
  chunkSize: number,
  processor: (items: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    const chunkResults = await processor(chunk);
    results.push(...chunkResults);
  }
  return results;
}

export async function printImageBase64(
  base64List: string[],
  options: IPrintImageBase64Option,
  fileName: string
) : Promise<File> {
  const { width, height, direction = PaperDirection.VERTICAL } = options
  const paperSize = convertPxToPaperSize(width, height)

  // Determine orientation based on dimensions and direction
  const orientation = direction === PaperDirection.HORIZONTAL ? 'landscape' : 'portrait'

  // Convert dimensions to mm
  function extractMm(value: string) {
    return parseFloat(value.replace('mm', ''))
  }

  let pdfWidth = 210 // default A4 width in mm
  let pdfHeight = 297 // default A4 height in mm

  if (paperSize.size) {
    // Use standard paper sizes if matched
    pdfWidth = extractMm(paperSize.width)
    pdfHeight = extractMm(paperSize.height)
  } else {
    // Convert pixels to mm (approximate conversion)
    const pxToMm = 0.264583
    pdfWidth = width * pxToMm
    pdfHeight = height * pxToMm
  }

  // Create PDF with correct orientation
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pdfWidth, pdfHeight]
  })

  try {
    const processedImages = await processInChunks(base64List, 5, async (chunk) => {
      return Promise.all(chunk.map(base64 => reencodeAsJpegNoResize(base64)));
    });

    // Add images with correct orientation
    processedImages.forEach((jpegBase64, i) => {
      if (i > 0) {
        pdf.addPage();
      }

      // When in landscape, swap width and height for proper image fitting
      const imageWidth = orientation === 'landscape' ? pdfHeight : pdfWidth;
      const imageHeight = orientation === 'landscape' ? pdfWidth : pdfHeight;

      pdf.addImage(
        jpegBase64,
        'JPEG',
        0,
        0,
        imageWidth,
        imageHeight,
        undefined,
        'NONE'
      );
    });

    // 5. Open PDF in a new tab
    const pdfBytes = pdf.output('arraybuffer')

    if (!fileName.endsWith('.pdf') && fileName !== '')
      fileName = `${fileName}.pdf`

    const file = new File([pdfBytes], fileName, { type: 'application/pdf' })
    if (file)
      return file;
  } catch (error) {
    console.error('Error processing images:', error);
    throw error;
  }
  return new File([], '')
}
