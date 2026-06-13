import './style.css'
import {
  FilesetResolver,
  FaceLandmarker,
} from '@mediapipe/tasks-vision'
import { removeBackground, preload } from '@imgly/background-removal'

const imageInput = document.getElementById('image-input') as HTMLInputElement
const removeBgCheckbox = document.getElementById('remove-bg-checkbox') as HTMLInputElement
const loadingEl = document.getElementById('loading') as HTMLDivElement
const loadingText = document.getElementById('loading-text') as HTMLParagraphElement
const controlAreaEl = document.getElementById('control-area') as HTMLDivElement
const controlsEl = document.getElementById('controls') as HTMLDivElement
const adjustControlsEl = document.getElementById('adjust-controls') as HTMLDivElement
const startAnimBtn = document.getElementById('start-anim-btn') as HTMLButtonElement
const backToAdjustBtn = document.getElementById('back-to-adjust-btn') as HTMLButtonElement
const micBtn = document.getElementById('mic-btn') as HTMLButtonElement
const micStatus = document.getElementById('mic-status') as HTMLDivElement
const volumeBar = document.getElementById('volume-bar') as HTMLDivElement
const rotationSlider = document.getElementById('rotation-slider') as HTMLInputElement
const rotationValue = document.getElementById('rotation-value') as HTMLSpanElement
const zoomSlider = document.getElementById('zoom-slider') as HTMLInputElement
const zoomValue = document.getElementById('zoom-value') as HTMLSpanElement
const resultAreaEl = document.getElementById('result-area') as HTMLDivElement
const backgroundControlsEl = document.getElementById('background-controls') as HTMLDivElement
const greenBackBtn = document.getElementById('green-back-btn') as HTMLButtonElement
const canvas = document.getElementById('canvas') as HTMLCanvasElement

let originalImage: HTMLImageElement | null = null
let faceLandmarker: FaceLandmarker | null = null
let animationId: number | null = null
let isAnimating = false

// Mouth rect (auto or manual) with rotation in radians
let mouthRect: { x: number; y: number; width: number; height: number } | null = null
let imageRotation = 0
let imageOffset = { x: 0, y: 0 }
let imageScale = 1.0

// Background
let isGreenBack = false
const GREEN_BACK_COLOR = '#00b140'
const DEFAULT_BG_COLOR = '#1a1a2e'

// Preload state
let isModelPreloaded = false

// Mode flags
let isAdjusting = false

// Drag state
let isDragging = false
let dragOffset = { x: 0, y: 0 }
let dragMode: 'move' | 'resize' | 'move-image' | null = null
let resizeHandle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null = null
const HANDLE_SIZE = 20
const HANDLE_HIT_SIZE = 40

// Audio context
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let micStream: MediaStream | null = null

// Initialize MediaPipe
async function initMediaPipe() {
  loadingEl.classList.remove('hidden')
  const loadingText = loadingEl.querySelector('p')!
  loadingText.textContent = 'AIモデルを読み込み中...'

  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    )

    loadingText.textContent = '顔認識モデルを初期化中...'

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
    })

    console.log('MediaPipe FaceLandmarker initialized')
  } catch (error) {
    console.error('Failed to initialize MediaPipe:', error)
    alert('AIモデルの読み込みに失敗しました。インターネット接続を確認してください。')
    throw error
  } finally {
    loadingEl.classList.add('hidden')
  }
}

// Load image from File or URL string
function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })
}

// Resize image to max size for background removal processing
function resizeImageToBlob(img: HTMLImageElement, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const newWidth = Math.round(img.width * scale)
    const newHeight = Math.round(img.height * scale)

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = newWidth
    tempCanvas.height = newHeight
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(img, 0, 0, newWidth, newHeight)

    tempCanvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}

// Background removal with automatic size fallback
async function removeBackgroundWithFallback(img: HTMLImageElement): Promise<HTMLImageElement> {
  const sizes = [1024, 768, 512]

  for (const maxSize of sizes) {
    try {
      loadingText.textContent = `AIで背景を除去中...(${maxSize}pxにリサイズ / 初回は40MBダウンロード)`
      const blob = await resizeImageToBlob(img, maxSize)
      const file = new File([blob], 'resized.png', { type: 'image/png' })
      const resultBlob = await removeBackground(file)
      const url = URL.createObjectURL(resultBlob)
      return await loadImage(url)
    } catch (error) {
      console.error(`Background removal failed at ${maxSize}px:`, error)
      if (maxSize === 512) {
        throw new Error('背景除去に失敗しました。画像サイズが大きすぎるか、端末のメモリが不足している可能性があります。')
      }
    }
  }

  throw new Error('背景除去に失敗しました')
}

// Handle image upload
async function handleImageUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  // Preload background removal model if enabled and not yet cached
  if (removeBgCheckbox.checked && !isModelPreloaded) {
    loadingEl.classList.remove('hidden')
    loadingText.textContent = 'AIモデルを準備中...（40MB / 初回のみ）'
    try {
      await preload({
        progress: (_key, current, total) => {
          loadingText.textContent = `AIモデルを準備中...(${current}/${total})`
        }
      })
      isModelPreloaded = true
      console.log('Background removal model preloaded')
    } catch (error) {
      console.error('Failed to preload model:', error)
    }
  }

  // Initialize MediaPipe if needed
  if (!faceLandmarker) {
    await initMediaPipe()
  }

  loadingEl.classList.remove('hidden')

  // Reset state
  stopAnimation()
  mouthRect = null
  imageRotation = 0
  imageOffset = { x: 0, y: 0 }
  imageScale = 1.0
  rotationSlider.value = '0'
  rotationValue.textContent = '0°'
  zoomSlider.value = '100'
  zoomValue.textContent = '100%'
  isAdjusting = false
  isDragging = false

  try {
    originalImage = await loadImage(file)

    // Background removal if enabled
    if (removeBgCheckbox.checked) {
      originalImage = await removeBackgroundWithFallback(originalImage)
    }

    // Show control area and image result area
    controlAreaEl.classList.remove('hidden')
    resultAreaEl.classList.remove('hidden')
    backgroundControlsEl.classList.remove('hidden')

    // Set canvas size
    canvas.width = originalImage.width
    canvas.height = originalImage.height

    // Detect face landmarks
    const results = faceLandmarker!.detect(originalImage)

    if (results.faceLandmarks.length === 0) {
      // No face detected - initialize default rect and go to adjust mode
      loadingEl.classList.add('hidden')
      
      // Initialize default rectangle centered on image
      const defaultWidth = canvas.width * 0.3
      const defaultHeight = canvas.height * 0.2
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      mouthRect = {
        x: centerX - defaultWidth / 2,
        y: centerY - defaultHeight / 2,
        width: defaultWidth,
        height: defaultHeight,
      }

      startAdjustMode()
      return
    }

    // Auto-detected mouth rect
    const landmarks = results.faceLandmarks[0]

    // Use specific landmarks for better positioning
    // Landmark 0: upper lip top, 13: upper lip bottom, 14: lower lip top, 17: lower lip bottom
    const mouthCenter = landmarks[14]     // Center line = where lips meet (lower lip top)
    const mouthLeft = landmarks[61]       // Left corner of mouth
    const mouthRight = landmarks[291]     // Right corner of mouth
    const chinTip = landmarks[152]        // Chin tip

    // If chin tip is not detected, fall back to mouth bottom
    const bottomY = chinTip ? Math.max(chinTip.y, mouthCenter.y) : landmarks[17].y

    mouthRect = {
      x: mouthLeft.x * canvas.width,
      y: mouthCenter.y * canvas.height,
      width: (mouthRight.x - mouthLeft.x) * canvas.width,
      height: (bottomY - mouthCenter.y) * canvas.height,
    }

    // Go directly to adjust mode (skip manual drawing)
    loadingEl.classList.add('hidden')
    startAdjustMode()
  } catch (error) {
    console.error('Error:', error)
    alert('画像の処理中にエラーが発生しました。')
    loadingEl.classList.add('hidden')
  }
}

// Start adjust mode (move existing rectangle)
function startAdjustMode() {
  isAdjusting = true
  adjustControlsEl.classList.remove('hidden')
  controlsEl.classList.add('hidden')
  document.getElementById('instructions')?.classList.add('hidden')

  // Draw initial image with mouth rect
  drawAdjustingPreview()

  // Ensure mouse listeners are attached
  attachMouseListeners()
}

// Attach mouse listeners to canvas
function attachMouseListeners() {
  canvas.removeEventListener('mousedown', onMouseDown)
  canvas.removeEventListener('mousemove', onMouseMove)
  canvas.removeEventListener('mouseup', onMouseUp)
  canvas.removeEventListener('wheel', onWheel)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('mouseenter', onMouseHover)
  canvas.addEventListener('mousemove', onMouseHover)
  canvas.addEventListener('wheel', onWheel, { passive: false })
}

// Mouse event handlers
function onMouseDown(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  if (isAdjusting && mouthRect) {
    // Check if clicking on a resize handle
    const handle = getHandleAt(x, y)
    if (handle) {
      isDragging = true
      dragMode = 'resize'
      resizeHandle = handle
      return
    }

    // Move existing rectangle
    const withinRect = x >= mouthRect.x && x <= mouthRect.x + mouthRect.width && y >= mouthRect.y && y <= mouthRect.y + mouthRect.height

    if (withinRect) {
      isDragging = true
      dragMode = 'move'
      dragOffset = {
        x: x - mouthRect.x,
        y: y - mouthRect.y,
      }
    } else {
      // Move image (pan) when clicking outside the rect
      isDragging = true
      dragMode = 'move-image'
      dragOffset = {
        x: x - imageOffset.x,
        y: y - imageOffset.y,
      }
    }
  }
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  if (isAdjusting && mouthRect) {
    if (dragMode === 'resize' && resizeHandle) {
      let newX = mouthRect.x
      let newY = mouthRect.y
      let newW = mouthRect.width
      let newH = mouthRect.height

      if (resizeHandle === 'nw' || resizeHandle === 'sw' || resizeHandle === 'w') {
        newX = Math.min(x, mouthRect.x + mouthRect.width)
        newW = Math.abs(mouthRect.x + mouthRect.width - x)
      }
      if (resizeHandle === 'ne' || resizeHandle === 'se' || resizeHandle === 'e') {
        newW = Math.abs(x - mouthRect.x)
      }
      if (resizeHandle === 'nw' || resizeHandle === 'ne' || resizeHandle === 'n') {
        newY = Math.min(y, mouthRect.y + mouthRect.height)
        newH = Math.abs(mouthRect.y + mouthRect.height - y)
      }
      if (resizeHandle === 'sw' || resizeHandle === 'se' || resizeHandle === 's') {
        newH = Math.abs(y - mouthRect.y)
      }

      if (newW > 10 && newH > 10) {
        mouthRect = {
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        }
      }
    } else if (dragMode === 'move') {
      // Move mouth rect
      mouthRect.x = x - dragOffset.x
      mouthRect.y = y - dragOffset.y
    } else if (dragMode === 'move-image') {
      // Move image
      imageOffset.x = x - dragOffset.x
      imageOffset.y = y - dragOffset.y
    }
    drawAdjustingPreview()
  }
}

function onMouseUp() {
  isDragging = false
  dragMode = null
  resizeHandle = null
}

function onWheel(e: WheelEvent) {
  if (!isAdjusting || !mouthRect) return
  e.preventDefault()

  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.min(Math.max(imageScale * delta, 0.5), 3.0)

  applyZoom(newScale)

  zoomSlider.value = String(Math.round(newScale * 100))
  zoomValue.textContent = `${Math.round(newScale * 100)}%`

  drawAdjustingPreview()
}

function onMouseHover(e: MouseEvent) {
  if (!isAdjusting || !mouthRect || isDragging) {
    canvas.style.cursor = isAdjusting ? 'move' : 'crosshair'
    return
  }

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  const handle = getHandleAt(x, y)
  if (handle) {
    if (handle === 'nw' || handle === 'se') {
      canvas.style.cursor = 'nwse-resize'
    } else if (handle === 'ne' || handle === 'sw') {
      canvas.style.cursor = 'nesw-resize'
    } else if (handle === 'n' || handle === 's') {
      canvas.style.cursor = 'ns-resize'
    } else if (handle === 'e' || handle === 'w') {
      canvas.style.cursor = 'ew-resize'
    }
    } else {
      const withinRect = x >= mouthRect.x && x <= mouthRect.x + mouthRect.width && y >= mouthRect.y && y <= mouthRect.y + mouthRect.height
      if (withinRect) {
        canvas.style.cursor = 'move'
      } else {
        canvas.style.cursor = 'grab'
      }
    }
}

function getHandleAt(x: number, y: number): 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null {
  if (!mouthRect) return null

  const hh = HANDLE_HIT_SIZE / 2
  const x1 = mouthRect.x
  const y1 = mouthRect.y
  const x2 = mouthRect.x + mouthRect.width
  const y2 = mouthRect.y + mouthRect.height

  // Corners first (priority over edges)
  if (Math.abs(x - x1) <= hh && Math.abs(y - y1) <= hh) return 'nw'
  if (Math.abs(x - x2) <= hh && Math.abs(y - y1) <= hh) return 'ne'
  if (Math.abs(x - x1) <= hh && Math.abs(y - y2) <= hh) return 'sw'
  if (Math.abs(x - x2) <= hh && Math.abs(y - y2) <= hh) return 'se'

  // Edges
  if (Math.abs(y - y1) <= hh && x >= x1 && x <= x2) return 'n'
  if (Math.abs(y - y2) <= hh && x >= x1 && x <= x2) return 's'
  if (Math.abs(x - x1) <= hh && y >= y1 && y <= y2) return 'w'
  if (Math.abs(x - x2) <= hh && y >= y1 && y <= y2) return 'e'

  return null
}

function applyZoom(newScale: number) {
  if (!mouthRect) return

  const oldScale = imageScale
  const scaleRatio = newScale / oldScale

  const centerX = canvas.width / 2
  const centerY = canvas.height / 2

  mouthRect.x = centerX + (mouthRect.x - centerX) * scaleRatio
  mouthRect.y = centerY + (mouthRect.y - centerY) * scaleRatio
  mouthRect.width *= scaleRatio
  mouthRect.height *= scaleRatio

  imageOffset.x *= scaleRatio
  imageOffset.y *= scaleRatio

  imageScale = newScale
}

// Draw adjusting preview (rectangle + label + resize handles)
function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = isGreenBack ? GREEN_BACK_COLOR : DEFAULT_BG_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function drawAdjustingPreview() {
  if (!originalImage || !mouthRect) return
  const ctx = canvas.getContext('2d')!

  drawBackground(ctx)

  // 1. Draw rotated image with offset and zoom
  ctx.save()
  ctx.translate(canvas.width / 2 + imageOffset.x, canvas.height / 2 + imageOffset.y)
  ctx.scale(imageScale, imageScale)
  ctx.rotate(imageRotation)
  ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2)
  ctx.restore()

  // 2. Draw horizontal rectangle in canvas space (mouthRect is already in canvas coords)
  ctx.strokeStyle = '#e94560'
  ctx.lineWidth = 3
  ctx.setLineDash([5, 5])
  ctx.strokeRect(mouthRect.x, mouthRect.y, mouthRect.width, mouthRect.height)
  ctx.setLineDash([])

  // Draw label
  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('下唇〜顎', mouthRect.x + 5, mouthRect.y + 20)

  // Draw resize handles (corners + edges)
  const hs = HANDLE_SIZE / 2
  const handles = [
    // Corners
    { x: mouthRect.x, y: mouthRect.y },
    { x: mouthRect.x + mouthRect.width, y: mouthRect.y },
    { x: mouthRect.x, y: mouthRect.y + mouthRect.height },
    { x: mouthRect.x + mouthRect.width, y: mouthRect.y + mouthRect.height },
    // Edges
    { x: mouthRect.x + mouthRect.width / 2, y: mouthRect.y },
    { x: mouthRect.x + mouthRect.width / 2, y: mouthRect.y + mouthRect.height },
    { x: mouthRect.x, y: mouthRect.y + mouthRect.height / 2 },
    { x: mouthRect.x + mouthRect.width, y: mouthRect.y + mouthRect.height / 2 },
  ]
  for (const handle of handles) {
    // White border for contrast
    ctx.fillStyle = 'white'
    ctx.fillRect(handle.x - hs - 2, handle.y - hs - 2, HANDLE_SIZE + 4, HANDLE_SIZE + 4)
    // Main handle
    ctx.fillStyle = '#e94560'
    ctx.fillRect(handle.x - hs, handle.y - hs, HANDLE_SIZE, HANDLE_SIZE)
  }
}

// Start animation (hide all borders, begin lip sync)
async function onStartAnimation() {
  isAdjusting = false

  // Hide adjust controls
  adjustControlsEl.classList.add('hidden')

  // Remove mouse listeners (no more interaction needed)
  canvas.removeEventListener('mousedown', onMouseDown)
  canvas.removeEventListener('mousemove', onMouseMove)
  canvas.removeEventListener('mouseup', onMouseUp)
  canvas.removeEventListener('mouseenter', onMouseHover)
  canvas.removeEventListener('mousemove', onMouseHover)
  canvas.removeEventListener('wheel', onWheel)

  // Clear canvas to remove border lines
  const ctx = canvas.getContext('2d')!
  drawBackground(ctx)
  ctx.save()
  ctx.translate(canvas.width / 2 + imageOffset.x, canvas.height / 2 + imageOffset.y)
  ctx.scale(imageScale, imageScale)
  ctx.rotate(imageRotation)
  ctx.drawImage(originalImage!, -originalImage!.width / 2, -originalImage!.height / 2)
  ctx.restore()

  // Start animation loop
  startAnimationLoop()

  // Auto-start microphone if permission was previously granted
  try {
    await startMicrophone(true)
  } catch {
    // Permission not granted yet, user will manually click
  }

  // Show mic controls only after mic state is settled
  controlsEl.classList.remove('hidden')
}

// Start microphone
async function startMicrophone(silent: boolean = false) {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(micStream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    micBtn.textContent = '🎤 マイクをOFFにする'
    micBtn.classList.add('active')
    controlsEl.classList.add('mic-active')
    micStatus.textContent = 'マイク入力受信中...'
  } catch (error) {
    console.error('Mic error:', error)
    if (!silent) {
      alert('マイクの使用が許可されませんでした。')
    }
    throw error
  }
}

// Stop microphone
function stopMicrophone() {
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop())
    micStream = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  analyser = null

  micBtn.textContent = '🎤 マイクをONにする'
  micBtn.classList.remove('active')
  controlsEl.classList.remove('mic-active')
  micStatus.textContent = ''
  volumeBar.style.width = '0%'
}

// Get volume from microphone
function getVolume(): number {
  if (!analyser) return 0

  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(dataArray)

  // Calculate RMS
  let sum = 0
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i] * dataArray[i]
  }
  const rms = Math.sqrt(sum / dataArray.length)

  // Normalize (0-255 → 0-1)
  return Math.min(rms / 255, 1)
}

// Stop animation loop
function stopAnimation() {
  isAnimating = false
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
}

// Animation loop
function startAnimationLoop() {
  stopAnimation()
  isAnimating = true

  const ctx = canvas.getContext('2d')!

  // Smooth volume for animation
  let smoothedVolume = 0

  function animate() {
    if (!isAnimating || !originalImage || !mouthRect) return

    // Get current volume
    const rawVolume = getVolume()

    // Smooth the volume (exponential moving average) - more responsive
    smoothedVolume = smoothedVolume * 0.6 + rawVolume * 0.4

    // Update volume meter
    volumeBar.style.width = `${smoothedVolume * 100}%`

    // Calculate mouth offset (cheap puppet style)
    const maxOffset = Math.min(mouthRect.height * 0.8, 120)
    const exaggeratedVolume = Math.pow(smoothedVolume, 0.6)
    const offsetY = exaggeratedVolume * maxOffset

    // Draw frame
    drawBackground(ctx)

    // Draw rotated image with offset and zoom
    ctx.save()
    ctx.translate(canvas.width / 2 + imageOffset.x, canvas.height / 2 + imageOffset.y)
    ctx.scale(imageScale, imageScale)
    ctx.rotate(imageRotation)
    ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2)
    ctx.restore()

    // If mouth should open
    if (offsetY > 1) {
      const x = mouthRect.x
      const y = mouthRect.y
      const w = mouthRect.width
      const h = mouthRect.height

      // 1. Clear original mouth area with background color
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      drawBackground(ctx)
      ctx.restore()

      // 2. Draw shifted jaw portion using the same transform on the main canvas
      // Use clip + same translate/scale/rotate to avoid offscreen mismatch
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y + offsetY, w, h)
      ctx.clip()
      ctx.translate(canvas.width / 2 + imageOffset.x, canvas.height / 2 + imageOffset.y + offsetY)
      ctx.scale(imageScale, imageScale)
      ctx.rotate(imageRotation)
      ctx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2)
      ctx.restore()
    }

    animationId = requestAnimationFrame(animate)
  }

  animate()
}

// Event listeners
imageInput.addEventListener('change', handleImageUpload)
micBtn.addEventListener('click', () => {
  if (micBtn.classList.contains('active')) {
    stopMicrophone()
  } else {
    startMicrophone()
  }
})
startAnimBtn.addEventListener('click', onStartAnimation)

rotationSlider.addEventListener('input', (e) => {
  const degrees = parseInt((e.target as HTMLInputElement).value)
  rotationValue.textContent = `${degrees}°`
  imageRotation = degrees * Math.PI / 180
  if (isAdjusting) {
    drawAdjustingPreview()
  }
})

zoomSlider.addEventListener('input', (e) => {
  const percent = parseInt((e.target as HTMLInputElement).value)
  zoomValue.textContent = `${percent}%`
  const newScale = percent / 100
  applyZoom(newScale)
  if (isAdjusting) {
    drawAdjustingPreview()
  }
})

// Back to adjust mode from animation
backToAdjustBtn.addEventListener('click', () => {
  stopAnimation()
  stopMicrophone()
  startAdjustMode()
})

// Toggle green back background
greenBackBtn.addEventListener('click', () => {
  isGreenBack = !isGreenBack
  if (isGreenBack) {
    greenBackBtn.classList.add('active')
    greenBackBtn.textContent = '🟩 グリーンバックON'
  } else {
    greenBackBtn.classList.remove('active')
    greenBackBtn.textContent = '⬜ グリーンバックOFF'
  }
  if (isAdjusting) {
    drawAdjustingPreview()
  } else if (isAnimating) {
    // Trigger immediate redraw in animation loop
    const ctx = canvas.getContext('2d')!
    drawBackground(ctx)
  }
})
