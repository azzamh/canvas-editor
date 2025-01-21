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
  options: IPrintImageBase64Option
) {
  const { width, height, direction = PaperDirection.VERTICAL } = options
  const iframe = document.createElement('iframe')
  // 离屏渲染
  iframe.style.visibility = 'hidden'
  iframe.style.position = 'absolute'
  iframe.style.left = '0'
  iframe.style.top = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.append(iframe)

  const contentWindow = iframe.contentWindow!
  const doc = contentWindow.document
  doc.open()

  const container = document.createElement('div')
  const paperSize = convertPxToPaperSize(width, height)

  // Build DOM preview (optional)
  base64List.forEach(base64 => {
    const image = document.createElement('img')
    image.style.width =
      direction === PaperDirection.HORIZONTAL
        ? paperSize.height
        : paperSize.width
    image.style.height =
      direction === PaperDirection.HORIZONTAL
        ? paperSize.width
        : paperSize.height
    image.src = base64
    container.append(image)
  })

  // 1. Determine PDF orientation
  const orientation = direction === PaperDirection.HORIZONTAL ? 'landscape' : 'portrait'

  // 2. Convert the mm dimension to numeric
  function extractMm(value: string) {
    // e.g. "210mm" => 210
    return parseFloat(value.replace('mm', ''))
  }

  let pdfWidth = 210 // default A4 width in mm
  let pdfHeight = 297 // default A4 height in mm

  // If `size` is recognized (a3, a4, a5) then use that
  if (paperSize.size) {
    pdfWidth = extractMm(paperSize.width)
    pdfHeight = extractMm(paperSize.height)
  } else {
    // Basic px->mm conversion (0.264583 mm per px at ~96 dpi)
    const pxToMm = 0.264583
    pdfWidth = width * pxToMm
    pdfHeight = height * pxToMm
  }

  // 3. Create jsPDF
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pdfWidth, pdfHeight]
  })

  // 4. Process images in chunks of 5
  try {
    const processedImages = await processInChunks(base64List, 5, async (chunk) => {
      return Promise.all(chunk.map(base64 => reencodeAsJpegNoResize(base64)));
    });

    // Add processed images to PDF
    processedImages.forEach((jpegBase64, i) => {
      if (i > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        jpegBase64,
        'JPEG',
        0,
        0,
        pdfWidth,
        pdfHeight,
        undefined,
        'NONE'
      );
    });

    // 5. Open PDF in a new tab
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
  } catch (error) {
    console.error('Error processing images:', error);
    throw error;
  }

  // Clean up
  doc.close()
}
