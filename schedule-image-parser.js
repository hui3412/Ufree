(() => {
  "use strict";

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const ALIASES = [["monday", "mon", "lundi", "lun"], ["tuesday", "tue", "tues", "mardi", "mar"], ["wednesday", "wed", "mercredi", "mer"], ["thursday", "thu", "thur", "thurs", "jeudi", "jeu"], ["friday", "fri", "vendredi", "ven"], ["saturday", "sat", "samedi", "sam"], ["sunday", "sun", "dimanche", "dim"]];
  const BASE_WIDTH = 705;
  let libraryPromise;

  function loadOcr() {
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("assets/ocr/tesseract.min.js", document.baseURI).href;
        script.onload = () => resolve(globalThis.Tesseract);
        script.onerror = () => reject(new Error("Picture recognition could not load. Open the app online once, then try again."));
        document.head.append(script);
      }).catch(error => { libraryPromise = null; throw error; });
    }
    return libraryPromise;
  }

  async function imageCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width * height > 60000000) throw new Error("This picture is too large. Try a cropped screenshot of the timetable.");
      const scale = Math.min(Math.max(1, 2100 / width), 2800 / width, 4000 / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    } catch (error) {
      throw new Error(`Could not open this picture. Use a JPG, PNG or WebP screenshot. ${error.message}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function wordsFromData(data, scale) {
    const items = [];
    for (const block of data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          for (const word of line.words || []) {
            let text = String(word.text || "").trim();
            if (!text) continue;
            let { x0, y0, x1, y1 } = word.bbox;
            const leading = text.match(/^[^a-z]+/i)?.[0] || "";
            const clean = text.slice(leading.length);
            const token = clean.toLowerCase().match(/^[a-z]+/)?.[0];
            // Coloured guide annotations can be joined to a weekday word.
            // Symbol boxes let us discard that leading noise, not guess text.
            if (leading && ALIASES.some(aliases => aliases.includes(token)) && word.symbols?.length >= text.length) {
              const symbols = word.symbols.slice(leading.length);
              text = clean;
              x0 = Math.min(...symbols.map(symbol => symbol.bbox.x0));
              x1 = Math.max(...symbols.map(symbol => symbol.bbox.x1));
              y0 = Math.min(...symbols.map(symbol => symbol.bbox.y0));
              y1 = Math.max(...symbols.map(symbol => symbol.bbox.y1));
            }
            items.push({ text, x0: x0 * scale, x1: x1 * scale, y0: y0 * scale, y1: y1 * scale,
              cx: (x0 + x1) * scale / 2, cy: (y0 + y1) * scale / 2, height: (y1 - y0) * scale,
              confidence: word.confidence });
          }
        }
      }
    }
    return items;
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function headerRow(items) {
    const candidates = items.flatMap(item => {
      const token = item.text.toLowerCase().replace(/^[^a-z]+/, "").match(/^[a-z]+(?=$|[^a-z])/)?.[0];
      const day = ALIASES.findIndex(aliases => aliases.includes(token));
      return day < 0 ? [] : [{ ...item, day }];
    });
    // Do not let an isolated "mon" in French prose or a weekday mentioned
    // elsewhere on the page displace the aligned timetable header row.
    const rows = candidates.map(anchor => {
      const aligned = candidates.filter(item => Math.abs(item.cy - anchor.cy) <= Math.max(3, anchor.height || 0, item.height || 0) * .8);
      const matches = ALIASES.map((_, day) => aligned.filter(item => item.day === day).sort((a, b) => a.cx - b.cx)[0]);
      return { matches, count: matches.slice(0, 5).filter(Boolean).length, cy: anchor.cy };
    });
    rows.sort((a, b) => b.count - a.count || a.cy - b.cy);
    return rows[0]?.matches || [];
  }

  function headersFromItems(items, { recoverMissing = false } = {}) {
    let matches = headerRow(items);
    const known = matches.slice(0, 5).filter(Boolean);
    const canRecover = recoverMissing && known.length === 4 && matches[0] && matches[4];
    if (known.length < 5 && !canRecover) throw new Error("Could not read all five weekday headings. Use a clear, upright screenshot with the entire timetable visible.");
    const spacing = values => {
      const present = values.flatMap((item, index) => item ? [{ item, index }] : []);
      return median(present.flatMap((value, index) => present.slice(index + 1).map(next => (next.item.cx - value.item.cx) / (next.index - value.index))));
    };
    const roughWidth = spacing(matches);
    // Weekly headings include dates ("Mon. Jan 8", "Lun. 12 févr.").
    // Use the complete heading, not the left-aligned weekday token alone.
    const dateWord = /^(?:\d{1,2}[.,]?|jan(?:uary|vier)?\.?|f[eé]b(?:ruary)?\.?|f[eé]vr(?:ier)?\.?|mar(?:ch|s)?\.?|apr(?:il)?\.?|avr(?:il)?\.?|may|mai|jun(?:e)?\.?|juin|jul(?:y)?\.?|juil(?:let)?\.?|aug(?:ust)?\.?|ao[uû]t|sep(?:t(?:ember|embre)?)?\.?|oct(?:ober|obre)?\.?|nov(?:ember|embre)?\.?|d[eé]c(?:ember|embre)?\.?)$/i;
    matches = matches.map(item => {
      if (!item) return item;
      const dates = items.filter(word => word !== item && dateWord.test(word.text) && word.x0 >= item.x1 && word.x1 <= item.x0 + roughWidth * .9 && Math.abs(word.cy - item.cy) < Math.max(3, item.height || 0) * .75);
      if (!dates.length) return item;
      const x1 = Math.max(item.x1, ...dates.map(word => word.x1));
      return { ...item, x1, cx: (item.x0 + x1) / 2 };
    });
    if (canRecover) {
      const width = spacing(matches);
      const aligned = matches.slice(0, 5).every((item, index) => !item || Math.abs(item.cx - (matches[0].cx + index * width)) < width * .2);
      if (!aligned || width < 20) throw new Error("Could not locate the timetable columns. Use a clear picture of the entire timetable.");
      matches = matches.map((item, index) => {
        if (item || index >= 5) return item;
        const cx = matches[0].cx + index * width;
        const reference = matches[0];
        return { ...reference, text: DAYS[index], cx, x0: cx - width * .2, x1: cx + width * .2 };
      });
    }
    const headers = matches.filter(Boolean);
    const width = spacing(matches);
    if (width < 20 || headers.some(header => Math.abs(header.cy - headers[0].cy) > width / 3) || headers.some((header, index) => Math.abs(header.cx - (headers[0].cx + index * width)) > width * .25)) throw new Error("Could not locate the timetable columns. Crop the picture to the schedule and keep it upright.");
    return matches.flatMap((item, index) => item ? [{ day: DAYS[index], center: item.cx, left: item.cx - width / 2, right: item.cx + width / 2, width, header: item }] : []);
  }

  function normalizedTime(text) {
    let value = String(text).replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/[;.\-]/g, ":").replace(/\s+/g, "");
    // Tiny clock colons are often dropped entirely. Interpret HHMM only in
    // the already isolated time gutter, then require the usual axis checks.
    if (/^\d{3,4}$/.test(value)) value = `${value.slice(0, -2)}:${value.slice(-2)}`;
    const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
  }

  function fitTimeAxis(points) {
    const slopes = [];
    for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) {
      const delta = points[j].minute - points[i].minute;
      if (delta >= 60) slopes.push((points[j].cy - points[i].cy) / delta);
    }
    const slope = median(slopes.filter(value => value > 0));
    const intercept = median(points.map(point => point.cy - point.minute * slope));
    return { slope, intercept };
  }

  function halfHourGrid(points, headerBottom) {
    const groups = new Map();
    for (const point of points.filter(point => point.minute % 30 === 0)) {
      if (!groups.has(point.minute)) groups.set(point.minute, []);
      groups.get(point.minute).push(point);
    }
    // Adjacent rows print their shared boundary twice. The midpoint of those
    // two labels locates the boundary, not two separate start/end phases.
    const centers = [...groups].map(([minute, labels]) => ({ minute, cy: labels.reduce((sum, label) => sum + label.cy, 0) / labels.length, labels })).sort((a, b) => a.minute - b.minute);
    const paired = centers.filter(point => point.labels.length >= 2);
    if (paired.length < 3) throw new Error("Could not identify shared timetable boundaries. Use the full timetable view, not the numbered schedule-configuration grid.");
    // Single start/end labels sit either side of a boundary. Including those
    // padded positions in the fit biases the slope when OCR misses colons.
    const { slope, intercept } = fitTimeAxis(paired);
    const valid = centers.filter(point => Math.abs(point.cy - (intercept + point.minute * slope)) < slope * 9);
    if (!Number.isFinite(slope) || valid.length < 8 || valid.length < centers.length * .65) throw new Error("The time labels are unclear. Try an upright screenshot with the full time column.");
    const observedFirst = Math.min(...valid.map(point => point.minute));
    const last = Math.max(...valid.map(point => point.minute));
    // If OCR misses early labels, the aligned weekday header identifies the
    // first row of the already validated axis. Never extrapolate a long gap.
    const headerMinute = Math.round((headerBottom - intercept) / slope / 30) * 30;
    const first = headerMinute <= observedFirst && observedFirst - headerMinute <= 120 && Math.abs(intercept + headerMinute * slope - headerBottom) <= slope * 10 ? headerMinute : observedFirst;
    const labels = valid.flatMap(point => point.labels);
    const height = median(labels.map(point => point.height));
    const x0 = Math.min(...labels.map(point => point.x0)), x1 = Math.max(...labels.map(point => point.x1));
    const items = [];
    const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    for (let minute = first; minute < last; minute += 30) {
      const top = intercept + minute * slope, bottom = top + slope * 30;
      items.push({ text: clock(minute), x0, x1, cx: (x0 + x1) / 2, y0: top, y1: top + height, cy: top + height / 2, height });
      items.push({ text: clock(minute + 30), x0, x1, cx: (x0 + x1) / 2, y0: bottom - height, y1: bottom, cy: bottom - height / 2, height });
    }
    return { items, rowHeight: slope * 30, top: intercept + first * slope, bottom: intercept + last * slope, mode: "half-hour" };
  }

  function pairedTimeGrid(points) {
    for (const period of [30, 60]) {
      const residues = new Map();
      for (const point of points) {
        const phase = point.minute % period;
        if (!residues.has(phase)) residues.set(phase, []);
        residues.get(phase).push(point);
      }
      const phases = [...residues].sort((a, b) => b[1].length - a[1].length).slice(0, 2);
      if (phases.length !== 2 || phases.some(([, labels]) => labels.length < 4) || phases.reduce((sum, [, labels]) => sum + labels.length, 0) < points.length * .65) continue;
      // Fitting each phase separately avoids treating the padding around
      // printed start/end labels as minutes on the clock.
      const fits = phases.map(([phase, labels]) => ({ phase, labels, ...fitTimeAxis(labels) }));
      if (fits.some(fit => !Number.isFinite(fit.slope))) continue;
      const rowHeight = median(fits.map(fit => fit.slope * period));
      if (fits.some(fit => Math.abs(fit.slope * period - rowHeight) > rowHeight * .1)) continue;
      const consecutive = fits.reduce((sum, fit) => {
        const minutes = [...new Set(fit.labels.map(point => point.minute))].sort((a, b) => a - b);
        return sum + minutes.slice(1).filter((minute, index) => minute - minutes[index] === period).length;
      }, 0);
      if (consecutive < 3) continue;
      for (const startFit of fits) {
        const endFit = fits.find(fit => fit !== startFit);
        const duration = (endFit.phase - startFit.phase + period) % period;
        const firstObserved = Math.min(...points.map(point => point.minute));
        const first = firstObserved - ((firstObserved - startFit.phase + period) % period);
        const startCy = startFit.intercept + first * startFit.slope;
        const endCy = endFit.intercept + (first + duration) * endFit.slope;
        const withinRow = endCy - startCy;
        if (withinRow < rowHeight * .5 || withinRow > rowHeight * .95) continue;
        const rows = new Map();
        let accepted = 0;
        for (const point of points) {
          const choices = [{ kind: "start", cy: startCy, minute: first }, { kind: "end", cy: endCy, minute: first + duration }].map(phase => {
            const row = Math.round((point.cy - phase.cy) / rowHeight);
            return { ...phase, row, distance: Math.abs(point.cy - (phase.cy + row * rowHeight)), expected: phase.minute + row * period };
          }).filter(phase => phase.distance <= rowHeight * .18 && Math.abs(point.minute - phase.expected) <= 10).sort((a, b) => a.distance - b.distance);
          const match = choices[0];
          if (!match) continue;
          accepted += 1;
          if (!rows.has(match.row)) rows.set(match.row, {});
          const row = rows.get(match.row);
          if (!row[match.kind] || match.distance < row[match.kind].distance) row[match.kind] = { point, distance: match.distance };
        }
        if (accepted < 8 || accepted < points.length * .65 || rows.size < 4) continue;
        const firstRow = Math.min(...rows.keys()), lastRow = Math.max(...rows.keys());
        const labels = [...rows.values()].flatMap(row => [row.start?.point, row.end?.point].filter(Boolean));
        const height = median(labels.map(point => point.height));
        const x0 = Math.min(...labels.map(point => point.x0)), x1 = Math.max(...labels.map(point => point.x1));
        const items = [];
        let consistent = true;
        for (let index = firstRow; index <= lastRow; index += 1) {
          const row = rows.get(index) || {};
          const expectedStart = first + index * period, expectedEnd = expectedStart + duration;
          const shift = row.start ? row.start.point.minute - expectedStart : row.end ? row.end.point.minute - expectedEnd : 0;
          const start = row.start?.point.minute ?? expectedStart + shift;
          const end = row.end?.point.minute ?? expectedEnd + shift;
          if (end <= start || end - start > period || (items.length && start < Number(items.at(-1).text.slice(0, 2)) * 60 + Number(items.at(-1).text.slice(3)))) { consistent = false; break; }
          for (const [kind, minute, cy] of [["start", start, startCy + index * rowHeight], ["end", end, endCy + index * rowHeight]]) {
            const observed = row[kind]?.point;
            const center = observed?.cy ?? cy;
            items.push({ text: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`, x0, x1, cx: (x0 + x1) / 2, cy: center, y0: center - height / 2, y1: center + height / 2, height });
          }
        }
        if (!consistent) continue;
        // Clock times and physical row heights can change near the end of a
        // day. Preserve observed labels and use local boundary positions.
        const top = items[0].y0 - height / 2;
        const bottom = items.at(-1).y1 + height / 2;
        const boundaries = [top];
        for (let index = 2; index < items.length; index += 2) boundaries.push((items[index - 1].cy + items[index].cy) / 2);
        boundaries.push(bottom);
        return { items, rowHeight, top, bottom, boundaries, mode: "paired", period };
      }
    }
    throw new Error("The time labels are unclear or this timetable uses an unsupported time grid. Try a sharper picture or import its original PDF.");
  }

  function boundaryTimeGrid(points, headerBottom, canvas, firstColumn) {
    // A browser's image resampling can make OCR omit one of the two labels at
    // a shared half-hour boundary. Validate those labels against the *visible*
    // time-gutter rules instead of inventing duplicates or guessing an axis.
    const labels = points.filter(point => point.minute % 30 === 0);
    if (labels.length < 8) throw new Error("Not enough clock labels for border validation.");
    const x0 = median(labels.map(point => point.x0));
    const x1 = median(labels.map(point => point.x1));
    if (x1 >= firstColumn.left + 4 || x1 <= x0) throw new Error("Time labels are not inside the time column.");
    const padding = Math.max(2, (x1 - x0) * .12);
    const gutter = { left: Math.max(0, x0 - padding), right: Math.min(firstColumn.left, x1 + padding) };
    gutter.width = gutter.right - gutter.left;
    const rough = fitTimeAxis(labels).slope * 30;
    if (!Number.isFinite(rough) || rough < 3) throw new Error("Time-column spacing is unclear.");
    const borders = borderRows(canvas, gutter, headerBottom, Math.max(...labels.map(point => point.cy)) + rough * .6);
    const gaps = borders.slice(1).map((y, index) => y - borders[index]);
    const rowHeight = median(gaps.filter(gap => gap > rough * .65 && gap < rough * 1.35));
    if (!Number.isFinite(rowHeight) || borders.length < 9) throw new Error("Not enough visible time-column borders.");
    const top = borders[0];
    const lattice = borders.map(y => ({ y, row: Math.round((y - top) / rowHeight) }))
      .filter(value => Math.abs(value.y - top - value.row * rowHeight) <= Math.max(1.5, rowHeight * .08));
    if (lattice.length < 9 || lattice.length < borders.length * .85) throw new Error("Time-column borders are inconsistent.");
    const matched = labels.flatMap(point => {
      const boundary = lattice.reduce((best, value) => Math.abs(value.y - point.cy) < Math.abs(best.y - point.cy) ? value : best);
      // Labels in the middle of numbered configuration rows are not boundaries.
      return Math.abs(boundary.y - point.cy) <= rowHeight * .35 ? [{ ...point, row: boundary.row }] : [];
    });
    const origin = median(matched.map(point => point.minute - point.row * 30));
    const valid = matched.filter(point => point.minute === origin + point.row * 30);
    if (valid.length < 8 || valid.length < labels.length * .8 || new Set(valid.map(point => point.minute)).size < 8) throw new Error("Clock labels do not agree with visible borders.");
    const observedFirst = Math.min(...valid.map(point => point.row));
    // The first physical gutter rule immediately under the heading is another
    // independent anchor when a few early labels are missed. Limit recovery
    // to two hours, just as the duplicate-label method does.
    const first = observedFirst <= 4 && top - headerBottom <= rowHeight * .4 && origin >= 0 ? 0 : observedFirst;
    const last = Math.max(...valid.map(point => point.row));
    const height = median(valid.map(point => point.height));
    const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const items = [];
    for (let row = first; row < last; row++) {
      const y = top + row * rowHeight, next = y + rowHeight;
      items.push({ text: clock(origin + row * 30), x0, x1, cx: (x0 + x1) / 2, y0: y, y1: y + height, cy: y + height / 2, height });
      items.push({ text: clock(origin + (row + 1) * 30), x0, x1, cx: (x0 + x1) / 2, y0: next - height, y1: next, cy: next - height / 2, height });
    }
    return { items, rowHeight, top: top + first * rowHeight, bottom: top + last * rowHeight, mode: "half-hour", boundaryValidated: true };
  }

  function timeGrid(items, headerBottom, evidence = {}) {
    const markers = items.map(item => ({ ...item, time: normalizedTime(item.text) })).filter(item => item.time && item.y0 > headerBottom);
    markers.sort((a, b) => a.cy - b.cy);
    const points = markers.map(item => ({ ...item, minute: Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) }));
    if (points.length < 8) throw new Error("Could not read enough time labels. Include the time column on the left in a sharper screenshot.");
    if (points.filter(point => point.minute % 30 === 0).length >= points.length * .75) {
      try { return halfHourGrid(points, headerBottom); }
      catch (error) {
        if (evidence.canvas && evidence.column) {
          try { return boundaryTimeGrid(points, headerBottom, evidence.canvas, evidence.column); } catch { /* Retry OCR, never guess. */ }
        }
        throw error;
      }
    }
    return pairedTimeGrid(points);
  }

  function borderRows(canvas, column, minimumY, maximumY = canvas.height * BASE_WIDTH / canvas.width) {
    const scale = canvas.width / BASE_WIDTH;
    const left = Math.max(0, Math.round((column.left + column.width * 0.03) * scale));
    const right = Math.min(canvas.width, Math.round((column.right - column.width * 0.03) * scale));
    const width = right - left;
    const { data } = canvas.getContext("2d").getImageData(left, 0, width, canvas.height);
    const hits = [];
    const offsetY = Math.max(2, Math.ceil(scale * 1.3));
    const samples = Math.ceil(width / 2);
    const edgeSamples = Math.max(2, Math.ceil(samples * .04));
    for (let y = Math.max(offsetY, Math.floor(minimumY * scale)); y < Math.min(canvas.height - offsetY, Math.ceil(maximumY * scale) + offsetY); y += 1) {
      const matches = Array(19).fill(0), leftMatches = Array(19).fill(0), rightMatches = Array(19).fill(0);
      const shades = [];
      const aboveShades = [], belowShades = [];
      const channels = [[], [], []], aboveChannels = [[], [], []], belowChannels = [[], [], []];
      for (let x = 0; x < width; x += 2) {
        const offset = (y * width + x) * 4;
        const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
        const gray = (red + green + blue) / 3;
        shades.push(gray);
        if (gray < 90) continue;
        const above = ((y - offsetY) * width + x) * 4;
        const below = ((y + offsetY) * width + x) * 4;
        const aboveGray = (data[above] + data[above + 1] + data[above + 2]) / 3;
        const belowGray = (data[below] + data[below + 1] + data[below + 2]) / 3;
        if (gray > 248 && (aboveGray > 248 || belowGray > 248)) continue;
        aboveShades.push(aboveGray); belowShades.push(belowGray);
        for (let channel = 0; channel < 3; channel += 1) {
          channels[channel].push(data[offset + channel]);
          aboveChannels[channel].push(data[above + channel]);
          belowChannels[channel].push(data[below + channel]);
        }
        // Some Omnivox themes use a lighter (even white) separator between
        // adjacent purple classes. A real rule or fill transition has a
        // consistent contrast direction across its width in one RGB channel.
        for (let channel = 0; channel < 3; channel += 1) {
          const toAbove = data[offset + channel] - data[above + channel];
          const toBelow = data[offset + channel] - data[below + channel];
          const transition = data[above + channel] - data[below + channel];
          const patterns = [toAbove >= 3 && toBelow >= 3, toAbove <= -3 && toBelow <= -3,
            toAbove >= 3 && toBelow <= -3, toAbove <= -3 && toBelow >= 3,
            transition > 18, transition < -18];
          for (let pattern = 0; pattern < 6; pattern += 1) {
            if (!patterns[pattern]) continue;
            const index = channel * 6 + pattern;
            matches[index] += 1;
            if (x / 2 < edgeSamples) leftMatches[index] += 1;
            if (x / 2 >= samples - edgeSamples) rightMatches[index] += 1;
          }
        }
        // A dark rule can blend into one neighbouring fill. Preserve this
        // asymmetric evidence, subject to the same colour-uniformity checks.
        if (gray <= 248 && Math.max(aboveGray, belowGray) - gray > 3) {
          matches[18] += 1;
          if (x / 2 < edgeSamples) leftMatches[18] += 1;
          if (x / 2 >= samples - edgeSamples) rightMatches[18] += 1;
        }
      }
      // A full grid line also reaches the padding at a column edge. Compression
      // ringing around a wide title can cover most of its coloured cell,
      // but leaves the padding beside that title without a border.
      if (matches.some((count, index) => count / samples >= .72 && Math.max(leftMatches[index], rightMatches[index]) / edgeSamples >= .6)) {
        shades.sort((a, b) => a - b);
        aboveShades.sort((a, b) => a - b); belowShades.sort((a, b) => a - b);
        // A border has nearly uniform brightness. Dense text and JPEG ringing
        // can cover most of a row too, but have a much wider brightness range.
        const uniform = values => values[Math.floor(values.length * .9)] - values[Math.floor(values.length * .1)] < 24;
        const uniformChannels = rows => rows.every(values => { values.sort((a, b) => a - b); return uniform(values); });
        if (uniform(shades) && uniform(aboveShades) && uniform(belowShades) &&
            uniformChannels(channels) && uniformChannels(aboveChannels) && uniformChannels(belowChannels)) hits.push(y / scale);
      }
    }
    const groups = [];
    for (const y of hits) {
      const group = groups[groups.length - 1];
      if (group && y - group[group.length - 1] < 2) group.push(y);
      else groups.push([y]);
    }
    return groups.map(group => (group[0] + group[group.length - 1]) / 2);
  }

  function variableRowTimeGrid(items, headerBottom, canvas, firstColumn) {
    // Some semester views stretch a half-hour row to fit its course text.
    // Validate each physical gutter cell; pixel height no longer means time.
    const labels = items.map(item => ({ ...item, time: normalizedTime(item.text) }))
      .filter(item => item.time && item.y0 > headerBottom && item.x1 <= firstColumn.left + 3)
      .map(item => ({ ...item, minute: Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) }))
      .sort((a, b) => a.cy - b.cy);
    if (labels.length < 12 || labels.some(item => item.minute % 30)) throw new Error("Not enough half-hour clocks for variable rows.");
    const x0 = median(labels.map(item => item.x0)), x1 = median(labels.map(item => item.x1));
    const padding = Math.max(2, (x1 - x0) * .12);
    const gutter = { left: Math.max(0, x0 - padding), right: Math.min(firstColumn.left, x1 + padding) };
    gutter.width = gutter.right - gutter.left;
    const detected = borderRows(canvas, gutter, headerBottom);
    const last = detected.findIndex(y => y >= labels.at(-1).y1);
    const boundaries = detected.slice(0, last + 1);
    if (last < 6 || boundaries[0] > labels[0].y0) throw new Error("Variable rows need complete visible borders.");
    const heights = boundaries.slice(1).map((y, i) => y - boundaries[i]);
    const rowHeight = median(heights);
    const continues = row => detected.slice(last + 1).some(y => Math.abs(y - boundaries.at(-1) - row * rowHeight) < Math.max(2, rowHeight * .12));
    if (continues(1) && continues(2)) throw new Error("Only part of the variable time column was read.");
    if (boundaries[0] - headerBottom > rowHeight * .5 ||
        !heights.some(height => height > rowHeight * 1.5) ||
        heights.some(height => height < rowHeight * .6 || height > rowHeight * 6)) {
      throw new Error("This is not a validated variable-height timetable.");
    }
    const rows = heights.map((_, i) => labels.filter(item => item.y0 >= boundaries[i] && item.y1 <= boundaries[i + 1]));
    const pairs = rows.flatMap((row, i) => {
      const minutes = [...new Set(row.map(item => item.minute))];
      return minutes.length === 2 && minutes[1] - minutes[0] === 30 ? [minutes[0] - i * 30] : [];
    });
    const origin = median(pairs);
    if (pairs.length < 4 || pairs.some(value => value !== origin) || origin < 0 || origin + rows.length * 30 >= 1440 ||
        rows.some((row, i) => !row.length || row.some(item => item.minute !== origin + i * 30 && item.minute !== origin + (i + 1) * 30)) ||
        rows.flat().length !== labels.length || rows[0][0].minute !== origin || rows.at(-1).at(-1).minute !== origin + rows.length * 30) {
      throw new Error("Clock labels do not agree with the individual timetable rows.");
    }
    const height = median(labels.map(item => item.height));
    const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const markers = heights.flatMap((_, i) => {
      const top = boundaries[i], bottom = boundaries[i + 1];
      return [
        { text: clock(origin + i * 30), x0, x1, cx: (x0 + x1) / 2, y0: top, y1: top + height, cy: top + height / 2, height },
        { text: clock(origin + (i + 1) * 30), x0, x1, cx: (x0 + x1) / 2, y0: bottom - height, y1: bottom, cy: bottom - height / 2, height },
      ];
    });
    return { items: markers, rowHeight, top: boundaries[0], bottom: boundaries.at(-1), boundaries, mode: "variable-half-hour", boundaryValidated: true };
  }

  function readTimeGrid(items, headerBottom, evidence) {
    try { return readRegularTimeGrid(items, headerBottom, evidence); }
    catch (error) {
      if (evidence?.canvas?.getContext && evidence.column) {
        try { return variableRowTimeGrid(items, headerBottom, evidence.canvas, evidence.column); }
        catch { /* Preserve existing retries and errors when this layout is unproven. */ }
      }
      throw error;
    }
  }

  function readRegularTimeGrid(items, headerBottom, evidence) {
    const grid = timeGrid(items, headerBottom, evidence);
    if (evidence?.canvas?.getContext) {
      // A consistent subset is not a complete timetable. Full-page sparse OCR
      // can miss every afternoon clock while still yielding eight good labels.
      // Two continuing gutter rules prove that more rows remain to be read.
      const x0 = grid.items[0].x0, x1 = grid.items[0].x1;
      const padding = Math.max(2, (x1 - x0) * .12);
      const gutter = { left: Math.max(0, x0 - padding), right: Math.min(evidence.column.left, x1 + padding) };
      gutter.width = gutter.right - gutter.left;
      const continued = borderRows(evidence.canvas, gutter, grid.bottom + grid.rowHeight * .6, grid.bottom + grid.rowHeight * 2.3);
      const hasRow = row => continued.some(y => Math.abs(y - grid.bottom - row * grid.rowHeight) < Math.max(2, grid.rowHeight * .12));
      if ((hasRow(1) && hasRow(2)) || grid.top - headerBottom > grid.rowHeight * .75) {
        throw new Error("Only part of the visible time column was read. Retrying its remaining rows.");
      }
    }
    return grid;
  }

  function classRegions(canvas, columns, grid) {
    const rects = [];
    for (const column of columns) {
      const detected = borderRows(canvas, column, grid.top - grid.rowHeight * 0.25, grid.bottom + grid.rowHeight * .15);
      const lattice = grid.boundaries || Array.from({ length: Math.round((grid.bottom - grid.top) / grid.rowHeight) + 1 }, (_, row) => grid.top + row * grid.rowHeight);
      // A dense line of course text can resemble a border. Only keep lines
      // aligned with the validated row lattice, merging nearby JPEG edges.
      const aligned = new Map();
      for (const y of detected) {
        let row = 0;
        for (let index = 1; index < lattice.length; index += 1) if (Math.abs(y - lattice[index]) < Math.abs(y - lattice[row])) row = index;
        const expected = lattice[row];
        if (Math.abs(y - expected) > Math.max(2, grid.rowHeight * (grid.boundaries ? .18 : .12))) continue;
        if (!aligned.has(row) || Math.abs(y - expected) < Math.abs(aligned.get(row) - expected)) aligned.set(row, y);
      }
      const boundaries = [...aligned.values()].sort((a, b) => a - b);
      if (boundaries.length < 3) throw new Error(`Could not locate the class borders for ${column.day}. Use a screenshot with visible grid lines.`);
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const y0 = boundaries[index], y1 = boundaries[index + 1];
        if (y1 - y0 < grid.rowHeight * 0.65) continue;
        rects.push({ x0: column.left, x1: column.right, y0, y1, width: column.width, height: y1 - y0, day: column.day });
      }
    }
    return rects;
  }

  function isolateTimetable(canvas, columns, grid) {
    const scale = BASE_WIDTH / canvas.width;
    const left = Math.max(0, Math.floor((grid.items[0].x0 - columns[0].width * .35) / scale));
    const right = Math.min(canvas.width, Math.ceil(columns.at(-1).right / scale));
    const top = Math.max(0, Math.floor((Math.min(...columns.map(column => column.header.y0)) - 5) / scale));
    const bottom = Math.min(canvas.height, Math.ceil((grid.bottom + grid.rowHeight * .15) / scale));
    const cropped = document.createElement("canvas");
    cropped.width = right - left;
    cropped.height = bottom - top;
    cropped.getContext("2d", { willReadFrequently: true }).drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    const factor = canvas.width / cropped.width;
    const x = value => (value - left * scale) * factor;
    const y = value => (value - top * scale) * factor;
    const box = item => ({ ...item, x0: x(item.x0), x1: x(item.x1), y0: y(item.y0), y1: y(item.y1), cx: x(item.cx), cy: y(item.cy), height: item.height * factor });
    return { canvas: cropped,
      columns: columns.map(column => ({ ...column, left: x(column.left), right: x(column.right), center: x(column.center), width: column.width * factor, header: box(column.header) })),
      grid: { ...grid, items: grid.items.map(box), rowHeight: grid.rowHeight * factor, top: y(grid.top), bottom: y(grid.bottom), ...(grid.boundaries ? { boundaries: grid.boundaries.map(y) } : {}) },
    };
  }

  function containsInk(canvas, rectangle) {
    const scale = canvas.width / BASE_WIDTH;
    // Header centering can be a few pixels off. Ignore the column-edge area
    // so a dark vertical border cannot make an empty cell look occupied.
    const marginX = Math.max(2, rectangle.width * .05);
    const left = Math.max(0, Math.ceil((rectangle.x0 + marginX) * scale));
    const top = Math.max(0, Math.ceil((rectangle.y0 + 2) * scale));
    const width = Math.min(canvas.width - left, Math.floor((rectangle.width - marginX * 2) * scale));
    const height = Math.min(canvas.height - top, Math.floor((rectangle.height - 4) * scale));
    if (width < 1 || height < 1) return false;
    const { data } = canvas.getContext("2d").getImageData(left, top, width, height);
    let ink = 0;
    for (let offset = 0; offset < data.length; offset += 16) {
      const r = data[offset], g = data[offset + 1], b = data[offset + 2];
      if (Math.min(r, g, b) < 160 && (r + g + b) / 3 < 180) ink += 1;
    }
    return ink > Math.max(12, width * height * 0.0003);
  }

  function recognitionPatch(canvas, rectangle, { contrast = false, removeRules = false } = {}) {
    // Only upscale the region being retried. Keep one temporary canvas, with a
    // strict pixel budget, rather than several full-page copies on a phone.
    const factor = Math.min(3, Math.max(1, 32 / Math.max(1, rectangle.textHeight || 16)), 4000 / rectangle.height, Math.sqrt(6000000 / (rectangle.width * rectangle.height)));
    const patch = document.createElement("canvas");
    const padding = 12;
    patch.width = Math.round(rectangle.width * factor) + padding * 2;
    patch.height = Math.round(rectangle.height * factor) + padding * 2;
    const context = patch.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "white";
    context.fillRect(0, 0, patch.width, patch.height);
    context.drawImage(canvas, rectangle.left, rectangle.top, rectangle.width, rectangle.height, padding, padding, patch.width - padding * 2, patch.height - padding * 2);
    if (contrast || removeRules) {
      const image = context.getImageData(0, 0, patch.width, patch.height);
      const { data } = image;
      for (let y = padding; y < patch.height - padding; y++) {
        let dark = 0;
        let minimum = 255, maximum = 0;
        for (let x = padding; x < patch.width - padding; x++) {
          const offset = (y * patch.width + x) * 4;
          const value = Math.min(data[offset], data[offset + 1], data[offset + 2]);
          const shade = contrast ? (value < 170 ? 0 : 255) : value;
          data[offset] = data[offset + 1] = data[offset + 2] = shade;
          minimum = Math.min(minimum, shade); maximum = Math.max(maximum, shade);
          if (shade < 245) dark++;
        }
        if (removeRules && dark > (patch.width - padding * 2) * .8 && maximum - minimum < 35) {
          for (let x = padding; x < patch.width - padding; x++) {
            const offset = (y * patch.width + x) * 4;
            data[offset] = data[offset + 1] = data[offset + 2] = 255;
          }
        }
      }
      context.putImageData(image, 0, 0);
    }
    const factorX = (patch.width - padding * 2) / rectangle.width;
    const factorY = (patch.height - padding * 2) / rectangle.height;
    return { canvas: patch, restore: word => {
      const x = value => rectangle.left + (value - padding) / factorX;
      const y = value => rectangle.top + (value - padding) / factorY;
      return { ...word, x0: x(word.x0), x1: x(word.x1), y0: y(word.y0), y1: y(word.y1), cx: x(word.cx), cy: y(word.cy), height: word.height / factorY };
    } };
  }

  async function patchWords(worker, canvas, rectangle, scale, parameters, processing) {
    const patch = recognitionPatch(canvas, rectangle, processing);
    try {
      await worker.setParameters(parameters);
      const result = await worker.recognize(patch.canvas, {}, { blocks: true, text: true });
      return wordsFromData(result.data, 1).map(patch.restore).map(word => ({ ...word,
        x0: word.x0 * scale, x1: word.x1 * scale, y0: word.y0 * scale, y1: word.y1 * scale,
        cx: word.cx * scale, cy: word.cy * scale, height: word.height * scale }));
    } finally { patch.canvas.width = patch.canvas.height = 1; }
  }

  async function parseScheduleCanvas(canvas, filename, options = {}) {
    const status = options.onProgress || (() => {});
    status("Loading picture recognition on this device…");
    const Tesseract = await loadOcr();
    const base = new URL("assets/ocr/", document.baseURI);
    let worker;
    let croppedCanvas;
    let stage = "Reading the timetable";
    let bootTimer;
    let bootFailed = false;
    try {
      let rejectBoot;
      const bootFailure = new Promise((_, reject) => { rejectBoot = reject; });
      bootTimer = setTimeout(() => rejectBoot(new Error("Picture recognition took too long to start. Open the app online and try again.")), 120000);
      const creation = Tesseract.createWorker("eng+fra", 1, {
        workerPath: new URL("worker.min.js", base).href,
        corePath: new URL("core/", base).href,
        langPath: new URL("lang/", base).href.replace(/\/$/, ""),
        workerBlobURL: false,
        errorHandler: error => rejectBoot(new Error(`Picture recognition stopped while ${stage.toLowerCase()}. Open the app online and try again. ${String(error)}`)),
        logger: message => { if (message.status === "recognizing text") status(`${stage}… ${Math.round(message.progress * 100)}%`); },
      });
      creation.then(value => { if (bootFailed) value.terminate(); }, () => {});
      worker = await Promise.race([creation, bootFailure]);
      clearTimeout(bootTimer);
      const recognize = worker.recognize.bind(worker);
      worker.recognize = async (...args) => {
        let timer;
        try {
          return await Promise.race([recognize(...args), bootFailure, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Picture recognition stalled while ${stage.toLowerCase()}. Try again with a smaller, clear screenshot.`)), 120000);
          })]);
        } finally { clearTimeout(timer); }
      };
      await worker.setParameters({ tessedit_pageseg_mode: "11", user_defined_dpi: "300" });
      let scale = BASE_WIDTH / canvas.width;
      const full = await worker.recognize(canvas, {}, { blocks: true, text: true });
      let fullItems = wordsFromData(full.data, scale);
      let columns;
      try { columns = headersFromItems(fullItems); }
      catch (error) {
        let partial = headerRow(fullItems).filter(Boolean);
        if (partial.length < 2) {
          stage = "Retrying the timetable layout";
          await worker.setParameters({ tessedit_pageseg_mode: "3", tessedit_char_whitelist: "" });
          const layout = await worker.recognize(canvas, {}, { blocks: true, text: true });
          fullItems = wordsFromData(layout.data, scale);
          try { columns = headersFromItems(fullItems); } catch { partial = headerRow(fullItems).filter(Boolean); }
        }
        if (!columns) {
          if (partial.length < 2 || (partial.length < 3 && (!partial.some(item => item.day === 0) || !partial.some(item => item.day === 4)))) throw error;
          stage = "Reading the weekday headings";
          await worker.setParameters({ tessedit_pageseg_mode: "7" });
          const padding = Math.max(...partial.map(item => item.height)) * .35;
          const top = Math.max(0, Math.floor((Math.min(...partial.map(item => item.y0)) - padding) / scale));
          const bottom = Math.min(canvas.height, Math.ceil((Math.max(...partial.map(item => item.y1)) + padding) / scale));
          const widths = partial.slice(1).map((item, index) => (item.cx - partial[index].cx) / (item.day - partial[index].day));
          const columnWidth = median(widths);
          const firstCenter = median(partial.map(item => item.cx - item.day * columnWidth));
          const left = Math.max(0, Math.floor((firstCenter - columnWidth * .7) / scale));
          const right = Math.min(canvas.width, Math.ceil((firstCenter + columnWidth * 4.8) / scale));
          const band = await worker.recognize(canvas, { rectangle: { left, top, width: right - left, height: bottom - top } }, { blocks: true });
          const headings = wordsFromData(band.data, scale);
          try { columns = headersFromItems(headings, { recoverMissing: true }); }
          catch {
            try { columns = headersFromItems(fullItems, { recoverMissing: true }); }
            catch {
              const restored = await patchWords(worker, canvas, { left, top, width: right - left, height: bottom - top, textHeight: median(partial.map(item => item.height)) / scale }, scale,
                { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "" }, { contrast: true });
              columns = headersFromItems(restored, { recoverMissing: true });
            }
          }
        }
      }
      const headerBottom = Math.max(...columns.map(column => column.header.y1));
      stage = "Reading the time column";
      let grid;
      try {
        grid = readTimeGrid(fullItems.filter(item => item.x1 <= columns[0].left + 2), headerBottom, { canvas, column: columns[0] });
      } catch {
        // Leave enough room for the final digit: header text can be off-center.
        await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "0123456789:." });
        const left = Math.max(0, Math.floor((columns[0].left - columns[0].width * .7) / scale));
        const right = Math.min(canvas.width, Math.ceil((columns[0].left + 3) / scale));
        const rectangle = { left, top: Math.max(0, Math.floor(headerBottom / scale)), width: right - left, height: canvas.height - Math.floor(headerBottom / scale) };
        const gutter = await worker.recognize(canvas, { rectangle }, { blocks: true });
        const evidence = { canvas, column: columns[0] };
        try { grid = readTimeGrid(wordsFromData(gutter.data, scale).filter(item => item.x1 <= columns[0].left + 3), headerBottom, evidence); }
        catch {
          for (const [mode, contrast] of [["11", false], ["6", true]]) {
            stage = contrast ? "Retrying faint time labels" : "Retrying the time column without grid lines";
            const words = await patchWords(worker, canvas, rectangle, scale,
              { tessedit_pageseg_mode: mode, tessedit_char_whitelist: "0123456789:." }, { contrast, removeRules: true });
            try { grid = readTimeGrid(words.filter(item => item.x1 <= columns[0].left + 3), headerBottom, evidence); break; }
            catch { /* Continue to the next independent reading method. */ }
          }
          if (!grid) throw new Error("Could not validate the full time column after several on-device reading methods. Include all the times and grid borders in a clear, upright screenshot. (Reader 53: time column)");
        }
      }
      status("Isolating the timetable from the rest of the picture…");
      const isolated = isolateTimetable(canvas, columns, grid);
      if (options.releaseSourceCanvas) canvas.width = canvas.height = 1;
      canvas = croppedCanvas = isolated.canvas;
      columns = isolated.columns;
      grid = isolated.grid;
      scale = BASE_WIDTH / canvas.width;
      const rects = classRegions(canvas, columns, grid).filter(rect => containsInk(canvas, rect));
      const items = [...columns.map(column => ({ ...column.header, text: column.day })), ...grid.items];
      const recognizedCells = [];
      await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
      let recognized = 0;
      for (const rect of rects) {
        stage = `Reading class ${++recognized} of ${rects.length}`;
        const left = Math.max(0, Math.ceil((rect.x0 + 1.5) / scale));
        const top = Math.max(0, Math.ceil((rect.y0 + 1.5) / scale));
        const right = Math.min(canvas.width, Math.floor((rect.x1 - 1.5) / scale));
        const bottom = Math.min(canvas.height, Math.floor((rect.y1 - 1.5) / scale));
        const rectangle = { left, top, width: right - left, height: bottom - top };
        const result = await worker.recognize(canvas, { rectangle }, { blocks: true, text: true });
        let words = wordsFromData(result.data, scale);
        const quality = values => {
          const readable = values.filter(word => /[a-z0-9]/i.test(word.text));
          const confidence = readable.length ? readable.reduce((sum, word) => sum + (Number.isFinite(word.confidence) ? word.confidence : 0), 0) / readable.length : 0;
          return confidence + Math.min(20, readable.length * 2);
        };
        if (!words.length || quality(words) < 65) {
          stage = `Retrying unclear class ${recognized} of ${rects.length}`;
          const restored = await patchWords(worker, canvas, { ...rectangle, textHeight: median(words.map(word => word.height)) / scale || 16 }, scale,
            { tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" }, { contrast: true });
          // Pick one complete pass, not a mixture of disagreeing course codes.
          if (quality(restored) > quality(words)) words = restored;
          await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
        }
        // Merge each line within one cell so spaced course codes and section
        // labels remain together without ever joining neighboring columns.
        const groups = [];
        for (const word of words.sort((a, b) => a.cy - b.cy || a.x0 - b.x0)) {
          const group = groups.find(value => Math.abs(value.cy - word.cy) < Math.max(2.7, word.height * 0.35));
          if (group) { group.words.push(word); group.cy = group.words.reduce((sum, value) => sum + value.cy, 0) / group.words.length; }
          else groups.push({ cy: word.cy, words: [word] });
        }
        for (const group of groups) {
          const row = group.words.sort((a, b) => a.x0 - b.x0);
          const text = row.map(word => word.text).join(" ")
            .replace(/\b([A-Z0-9]{3})\s*-\s*([A-Z0-9]{3})\s*-\s*([A-Z0-9]{2})\b/gi, "$1-$2-$3")
            // OCR frequently reads the letter I in room I-216 as 1 or |.
            // Only correct it after an explicit room label, never in names.
            .replace(/\b(Classroom|Local|Classe|Salle(?: de classe)?)\s+([1|])\s*-\s*(\d{2,4})\b/gi, "$1 I-$3");
          const x0 = Math.min(...row.map(word => word.x0)), x1 = Math.max(...row.map(word => word.x1));
          const y0 = Math.min(...row.map(word => word.y0)), y1 = Math.max(...row.map(word => word.y1));
          items.push({ text, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: group.cy, height: y1 - y0 });
        }
        const lines = globalThis.WhosFreeParser.groupScheduleLines(items.filter(item => item.cx >= rect.x0 && item.cx <= rect.x1 && item.cy > rect.y0 && item.cy < rect.y1), 2.8);
        recognizedCells.push({ rect, lines, words });
      }
      const starts = grid.items.filter((_, index) => index % 2 === 0).map(item => ({ time: item.text, y0: item.y0, y1: item.y1, center: item.cy }));
      const ends = grid.items.filter((_, index) => index % 2 === 1).map(item => ({ time: item.text, y0: item.y0, y1: item.y1, center: item.cy }));
      if (recognizedCells.length >= 4 && recognizedCells.filter(cell => !cell.words.some(word => /[a-z0-9]/i.test(word.text))).length > recognizedCells.length / 2) {
        throw new Error("Too much of the timetable is unreadable, even after text retries. Try a closer screenshot of the timetable, with all headings and times included.");
      }
      const classes = classesFromCells(recognizedCells, starts, ends, grid.rowHeight, grid);
      if (!classes.length) throw new Error("No classes could be read. Use a sharper screenshot showing the entire timetable.");
      if (grid.boundaryValidated) for (const item of classes) {
        item.review_warning = [item.review_warning, "Time labels were recovered using visible grid borders. Check these times against the picture."].filter(Boolean).join(" ");
      }
      const name = globalThis.WhosFreeParser.extractScheduleName(fullItems) || "";
      return { name, person: { source_file: filename, classes }, needsReview: true };
    } catch (error) {
      throw new Error(`${error.message || "The picture could not be read."}${String(error.message).includes("Reader 53:") ? "" : ` (Reader 53: ${stage.toLowerCase()})`}`);
    } finally {
      bootFailed = true;
      clearTimeout(bootTimer);
      await worker?.terminate();
      if (croppedCanvas) croppedCanvas.width = croppedCanvas.height = 1;
    }
  }

  function variableRowTimes(rect, grid) {
    const nearest = y => grid.boundaries.reduce((best, value, i) => Math.abs(value - y) < Math.abs(grid.boundaries[best] - y) ? i : best, 0);
    const first = nearest(rect.y0), last = nearest(rect.y1);
    const tolerance = Math.max(2, grid.rowHeight * .18);
    if (last <= first || Math.abs(grid.boundaries[first] - rect.y0) > tolerance || Math.abs(grid.boundaries[last] - rect.y1) > tolerance) {
      throw new Error("A class does not align with the validated timetable rows. Check the picture's borders.");
    }
    return { start: grid.items[first * 2].text, end: grid.items[last * 2 - 1].text };
  }

  function classesFromCells(cells, starts, ends, rowHeight, grid = null) {
    const classes = [];
    for (const { rect, lines: recognizedLines, words } of cells) {
      // In narrow semester cells OCR can split a printed code as "602-UF 1-MQ".
      // Join only the fixed code shape on the new path; do not infer characters.
      const lines = grid?.mode === "variable-half-hour" ? recognizedLines.map(line => line.replace(
        /\b([A-Z0-9]{3})\s*-\s*([A-Z0-9](?:\s*[A-Z0-9]){2})\s*-\s*([A-Z0-9]{2})\b/gi,
        (_, prefix, middle, suffix) => `${prefix}-${middle.replace(/\s/g, "")}-${suffix}`
      )) : recognizedLines;
      const codes = lines.join(" ").match(/\b[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}\b/gi) || [];
      const warnings = [];
      if (codes.length > 1) warnings.push("Check this busy span: multiple courses were detected. Split it if needed.");
      if (!lines.length) warnings.push("Text unreadable: check these busy times.");
      const scores = (words || []).filter(word => Number.isFinite(word.confidence) && word.confidence >= 0 && word.confidence <= 100);
      const weight = scores.reduce((sum, word) => sum + Math.max(1, String(word.text || "").length), 0);
      const confidence = weight ? scores.reduce((sum, word) => sum + word.confidence * Math.max(1, String(word.text || "").length), 0) / weight : null;
      // OCR confidence is a text-reading signal, not a probability that the
      // schedule is correct. Missing scores never imply reliable recognition.
      if (confidence !== null && (confidence < 70 || scores.some(word => String(word.text || "").length >= 3 && word.confidence < 45))) {
        warnings.push("Text recognition is uncertain. Check the wording and busy times against the picture.");
      } else if (words?.length && scores.length !== words.length) {
        warnings.push("Some text confidence is unavailable. Check this block against the picture.");
      }
      const warning = warnings.join(" ");
      const parsed = globalThis.WhosFreeParser.parseScheduleClassLines(lines);
      const label = lines.join(" ").trim();
      const busy = /^(?:athletes?\s+(?:student|etudiant)|confli(?:ct|t)\s*\d*)$/i.test(label.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      // Occupancy follows the cell geometry, never a known course name/code.
      let times = (codes.length <= 1 && parsed.explicitTime) || (grid?.mode === "variable-half-hour"
        ? variableRowTimes(rect, grid)
        : globalThis.WhosFreeParser.scheduleTimesFromRectangle(rect, starts, ends, rowHeight));
      delete parsed.explicitTime;
      if (busy || !parsed.course_code) parsed.course = label || "Busy block";
      if (times.end <= times.start) continue;
      classes.push({ day: rect.day, ...times, ...parsed, kind: busy || !parsed.course_code ? "busy_block" : "class", ...(confidence !== null ? { recognition_confidence: Math.round(confidence * 10) / 10 } : {}), ...(warning ? { review_warning: warning } : {}) });
    }
    classes.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
    return classes;
  }

  async function parseScheduleImage(file, options = {}) {
    if (!(file instanceof Blob)) throw new Error("Choose a schedule picture.");
    const canvas = await imageCanvas(file);
    try { return await parseCanvas(canvas, file.name || "schedule.png", { ...options, releaseSourceCanvas: true }); }
    finally { canvas.width = canvas.height = 1; }
  }

  const parseCanvas = globalThis.WhosFreeDatedImageParser?.withFallback(parseScheduleCanvas, loadOcr) || parseScheduleCanvas;
  globalThis.WhosFreeImageParser = { parseScheduleImage, parseScheduleCanvas: parseCanvas, __test: { wordsFromData, timeGrid, readTimeGrid, boundaryTimeGrid, variableRowTimeGrid, recognitionPatch, patchWords, borderRows, headersFromItems, classesFromCells, classRegions, containsInk, isolateTimetable } };
})();


