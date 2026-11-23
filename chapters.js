const chapterLinks = [...document.querySelectorAll('.masthead nav a')];
const chapters = chapterLinks.map(link => document.querySelector(link.hash));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const missionDiagrams = [...document.querySelectorAll('.mission-figure')].map(figure => {
  const trace = figure.querySelector('.descent-trace');
  const marker = figure.querySelector('[data-marker]');
  return {
    figure,
    panel: figure.closest('.chapter-layout'),
    section: figure.closest('.mission'),
    trace,
    length: trace?.getTotalLength(),
    marker,
    staticTransform: marker?.getAttribute('transform'),
    progress: null
  };
});
document.documentElement.classList.add('has-scroll-effects');

function updateChapter() {
  const readingLine = Math.min(window.innerHeight * 0.4, 280);
  let current = chapters[0];

  for (const chapter of chapters) {
    if (chapter.getBoundingClientRect().top > readingLine) break;
    current = chapter;
  }

  for (const link of chapterLinks) {
    if (link.hash === '#' + current.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function updateMissionDiagram(diagram) {
  const { figure, panel, section, trace, length, marker, staticTransform } = diagram;
  if (reduceMotion.matches) {
    if (diagram.progress === null) return;
    figure.style.removeProperty('--mission-scroll');
    figure.style.removeProperty('--mission-progress');
    marker?.setAttribute('transform', staticTransform);
    diagram.progress = null;
    return;
  }

  const sectionBounds = section.getBoundingClientRect();
  const panelBounds = panel.getBoundingClientRect();
  const sectionBorder = section.offsetHeight - section.clientHeight;
  const scrollDistance = sectionBounds.height - panelBounds.height - sectionBorder;
  if (scrollDistance <= 0) return;
  const pinnedDistance = panelBounds.top - sectionBounds.top;
  const scrollProgress = Math.max(0, Math.min(1, pinnedDistance / scrollDistance));
  if (scrollProgress === diagram.progress) return;
  diagram.progress = scrollProgress;

  figure.style.setProperty('--mission-scroll', scrollProgress);
  if (!trace) return;

  // Ease along the path while keeping the marker tied to the scroll position.
  const progress = (1 - Math.cos(scrollProgress * Math.PI)) / 2;
  const point = trace.getPointAtLength(length * progress);
  const angle = Math.sin(progress * Math.PI * 3) * 26;
  figure.style.setProperty('--mission-progress', progress);
  marker.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
}

function measureMissionPanels() {
  for (const { panel } of missionDiagrams) {
    panel.style.setProperty('--mission-panel-height', `${panel.offsetHeight}px`);
  }
  scheduleUpdate();
}

function updateScrollEffects() {
  updateChapter();
  missionDiagrams.forEach(updateMissionDiagram);
}

let frame;
function scheduleUpdate() {
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => {
    frame = undefined;
    updateScrollEffects();
  });
}

window.addEventListener('scroll', scheduleUpdate, { passive: true });
window.addEventListener('resize', scheduleUpdate);
window.addEventListener('pageshow', scheduleUpdate);
reduceMotion.addEventListener('change', scheduleUpdate);
const panelObserver = new ResizeObserver(measureMissionPanels);
missionDiagrams.forEach(({ panel }) => panelObserver.observe(panel));
measureMissionPanels();
updateScrollEffects();

const telemetry = document.querySelector('.telemetry');
const replayButton = telemetry.querySelector('.terminal-toggle');
const readout = telemetry.querySelector('.terminal-readout');
const initialSequence = Number(readout.firstElementChild.dataset.sequence);
let sequence = initialSequence;
const sensors = {
  pressure: { baseline: 1008.42, step: .18, range: .9, digits: 2 },
  temperature: { baseline: 18.6, step: .12, range: .5, digits: 1 },
  humidity: { baseline: 54.2, step: .28, range: 2, digits: 1 },
  uv: { baseline: 1.3, step: .08, range: .4, digits: 1 },
  accelX: { baseline: .12, step: .08, range: .35, digits: 2 },
  accelY: { baseline: -.08, step: .08, range: .35, digits: 2 },
  accelZ: { baseline: 9.74, step: .12, range: .45, digits: 2 },
  gyroX: { baseline: 1.2, step: .35, range: 1.5, digits: 1 },
  gyroY: { baseline: -.4, step: .35, range: 1.5, digits: 1 },
  gyroZ: { baseline: 3.1, step: .35, range: 1.5, digits: 1 }
};
// Public geographic anchors for the synthetic GPS readings, in decimal degrees.
const millRoadBridge = [52.198546, .14106274];
const millRoadCemetery = [52.202772, .137481];
let replayVisible = false;
let replayPaused = false;

function updateReplay() {
  replayButton.hidden = reduceMotion.matches;
  replayButton.textContent = replayPaused ? 'Resume replay' : 'Pause replay';
  telemetry.classList.toggle('is-streaming', replayVisible && !replayPaused && !reduceMotion.matches && !document.hidden);
}

function nextReading(sensor, signed = false) {
  const { baseline, step, range, digits } = sensor;
  const current = sensor.value ?? baseline;
  const next = current + (baseline - current) * .13 + (Math.random() * 2 - 1) * step;
  sensor.value = Math.min(baseline + range, Math.max(baseline - range, next));
  const magnitude = Math.abs(sensor.value).toFixed(digits);
  if (!signed) return magnitude;
  return (sensor.value < 0 && Number(magnitude) !== 0 ? '−' : '+') + magnitude;
}

function demoCoordinates(packetNumber) {
  const cycle = ((packetNumber - initialSequence) % 180) / 90;
  const progress = 1 - Math.abs(1 - cycle);
  return millRoadBridge.map((start, axis) =>
    (start + (millRoadCemetery[axis] - start) * progress).toFixed(5)
  ).join(', ');
}

telemetry.addEventListener('animationiteration', event => {
  if (event.animationName !== 'telemetry-flow' || !telemetry.classList.contains('is-streaming')) return;

  sequence += 1;
  const reading = document.createElement('div');
  reading.className = 'terminal-sample terminal-new';
  const lines = [
    `RX #${sequence} · ${nextReading(sensors.pressure)} hPa · ${nextReading(sensors.temperature)} °C`,
    `RH ${nextReading(sensors.humidity)}% · UV index ${nextReading(sensors.uv)}`,
    `GPS ${demoCoordinates(sequence)}`,
    `ACC ${nextReading(sensors.accelX, true)} ${nextReading(sensors.accelY, true)} ${nextReading(sensors.accelZ, true)} m/s²`,
    `GYR ${nextReading(sensors.gyroX, true)} ${nextReading(sensors.gyroY, true)} ${nextReading(sensors.gyroZ, true)} °/s`
  ];
  for (const text of lines) {
    const line = document.createElement('p');
    line.textContent = text;
    reading.append(line);
  }
  if (readout.childElementCount === 3) readout.firstElementChild.remove();
  readout.append(reading);
  readout.animate(
    [{ transform: 'translateY(var(--terminal-packet-height))' }, { transform: 'translateY(0)' }],
    { duration: 175, easing: 'cubic-bezier(.25, .75, .3, 1)' }
  );
});

replayButton.addEventListener('click', () => {
  replayPaused = !replayPaused;
  updateReplay();
});

const replayObserver = new IntersectionObserver(([entry]) => {
  replayVisible = entry.isIntersecting;
  updateReplay();
}, { threshold: .25 });
replayObserver.observe(telemetry);
document.addEventListener('visibilitychange', updateReplay);
reduceMotion.addEventListener('change', updateReplay);
updateReplay();
