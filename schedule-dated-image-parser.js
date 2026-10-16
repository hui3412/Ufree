(() => {
  "use strict";
  // Final fallback only: dated weekday headings, white outlined classes and
  // grey empty rows with printed start/end clocks. Dates never enter output.
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const DAY = /^(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?)\.?$/i;
  const MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i;
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const clock = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const unsupported = message => Object.assign(new Error(message), { code: "NOT_DATED_LAYOUT" });
  const shade = (data, offset) => (data[offset] + data[offset + 1] + data[offset + 2]) / 3;

  function wordsFromData(data, offsetX = 0, offsetY = 0) {
    return (data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []).flatMap(line => line.words || []).filter(word => word.text?.trim()).map(word => {
      const { x0, x1, y0, y1 } = word.bbox;
      return { text: word.text.trim(), x0: x0 + offsetX, x1: x1 + offsetX, y0: y0 + offsetY, y1: y1 + offsetY,
        cx: (x0 + x1) / 2 + offsetX, cy: (y0 + y1) / 2 + offsetY, height: y1 - y0, confidence: word.confidence };
    });
  }

  function mergeRules(values) {
    const groups = [];
    for (const value of values) {
      if (groups.length && value - groups.at(-1).at(-1) <= 2) groups.at(-1).push(value);
      else groups.push([value]);
    }
    return groups.map(group => (group[0] + group.at(-1)) / 2);
  }

  function datedHeaders(words) {
    const anchors = words.filter(word => DAY.test(word.text));
    for (const anchor of anchors) {
      const row = anchors.filter(word => Math.abs(word.cy - anchor.cy) <= Math.max(3, anchor.height * .7)).sort((a, b) => a.cx - b.cx);
      if (row.length !== 5 || row.some((word, i) => word.text.slice(0, 3).toLowerCase() !== DAYS[i].slice(0, 3).toLowerCase())) continue;
      const spacing = median(row.slice(1).map((word, i) => word.cx - row[i].cx));
      if (spacing < 40 || row.some((word, i) => Math.abs(word.cx - row[0].cx - i * spacing) > spacing * .2)) continue;
      const headers = row.map((word, i) => {
        const band = words.filter(item => item.cx >= word.x0 - spacing * .1 && item.cx < (row[i + 1]?.x0 ?? word.x0 + spacing) && Math.abs(item.cy - word.cy) < Math.max(3, word.height * .7)).sort((a, b) => a.x0 - b.x0);
        return { ...word, day: DAYS[i], dated: MONTH.test(band.map(item => item.text).join(" ")) };
      });
      if (headers.every(header => header.dated)) return headers;
    }
    throw unsupported("This is not a complete dated Monday-to-Friday timetable.");
  }

  function detectColumns(canvas, headers) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const top = Math.ceil(Math.max(...headers.map(header => header.y1)) + median(headers.map(header => header.height)) * .7);
    const step = Math.max(1, Math.floor((canvas.height - top) / 350));
    const counts = new Uint32Array(canvas.width); let samples = 0;
    for (let y = top; y < canvas.height - 1; y += step) {
      const { data } = context.getImageData(0, y, canvas.width, 1); samples++;
      for (let x = 0; x < canvas.width; x++) if (shade(data, x * 4) < 230) counts[x]++;
    }
    const rules = mergeRules(Array.from(counts, (count, x) => count > samples * .82 ? x : -1).filter(x => x >= 0));
    const columns = headers.map(header => {
      const right = rules.findIndex(x => x > header.cx);
      if (right < 1) throw unsupported("Could not validate the dated timetable's vertical borders.");
      return { day: header.day, left: rules[right - 1], right: rules[right] };
    });
    const width = median(columns.map(column => column.right - column.left));
    if (width < 40 || columns.some((column, i) => Math.abs(column.right - column.left - width) > width * .08 || (i && Math.abs(column.left - columns[i - 1].right) > 2))) throw unsupported("The dated timetable columns are incomplete or inconsistent.");
    return columns;
  }

  function detectRows(canvas, headers, columns) {
    const firstLeft = columns[0].left;
    let gutterLeft = Math.max(0, Math.ceil(firstLeft - (columns[0].right - firstLeft) * .6));
    // The clock gutter can be much narrower than a weekday column. Find its
    // actual outer rule before measuring horizontal clock-row borders.
    const counts = new Uint32Array(Math.floor(firstLeft) + 1); let samples = 0;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    for (let y = Math.ceil(Math.max(...headers.map(header => header.y1))); y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 150))) {
      const { data } = context.getImageData(0, y, counts.length, 1); samples++;
      for (let x = gutterLeft; x < firstLeft - 5; x++) if (shade(data, x * 4) < 230) counts[x]++;
    }
    const outerRules = mergeRules(Array.from(counts, (count, x) => count > samples * .82 ? x : -1).filter(x => x >= gutterLeft && x < firstLeft - 5));
    if (outerRules.length) gutterLeft = Math.ceil(outerRules.at(-1));
    const left = gutterLeft + 4, width = Math.floor(firstLeft - left - 4);
    if (width < 20) throw unsupported("The dated timetable's full clock column is missing.");
    const top = Math.ceil(Math.max(...headers.map(header => header.y1)));
    const height = canvas.height - top;
    const { data } = canvas.getContext("2d", { willReadFrequently: true }).getImageData(left, top, width, height);
    const rules = [];
    for (let y = 0; y < height; y++) {
      let ink = 0;
      for (let x = 0; x < width; x++) if (shade(data, (y * width + x) * 4) < 250) ink++;
      if (ink > width * .85) rules.push(top + y);
    }
    const boundaries = mergeRules(rules);
    if (boundaries.length < 9 || boundaries.length > 49) throw unsupported("The dated timetable needs complete clock-row borders.");
    const heights = boundaries.slice(1).map((y, i) => y - boundaries[i]), rowHeight = median(heights);
    if (rowHeight < 12 || heights.some(value => Math.abs(value - rowHeight) > rowHeight * .15) || boundaries[0] - top > rowHeight * .6 || canvas.height - boundaries.at(-1) > rowHeight * .8) throw unsupported("The dated timetable's rows are cropped or inconsistent.");
    return { boundaries, rowHeight, gutterLeft, gutterRight: firstLeft, headerBottom: top };
  }

  function timeValue(text) {
    const match = /^(\d{1,2})\s*[:.;]?\s*([0-5]\d)$/.exec(text);
    if (!match || Number(match[1]) > 23) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function readClockRows(words, grid) {
    const outside = words.some(word => word.cy > grid.headerBottom && word.x0 >= grid.gutterLeft && word.x1 <= grid.gutterRight + 2 && timeValue(word.text) !== null && (word.cy <= grid.boundaries[0] || word.cy >= grid.boundaries.at(-1)));
    if (outside) throw new Error("Some clock labels lie outside complete timetable rows. Include the full clock column and its borders.");
    return grid.boundaries.slice(1).map((bottom, row) => {
      const top = grid.boundaries[row];
      const labels = words.filter(word => word.cy > top && word.cy < bottom && word.x0 >= grid.gutterLeft && word.x1 <= grid.gutterRight + 2)
        .map(word => ({ ...word, minute: timeValue(word.text) })).filter(word => word.minute !== null).sort((a, b) => a.cy - b.cy);
      if (labels.length !== 2 || labels[1].minute - labels[0].minute !== 20) return null;
      return { start: labels[0].minute, end: labels[1].minute };
    });
  }

  function validateClockRows(rows) {
    if (rows.some(row => !row) || rows.some((row, i) => i && row.start - rows[i - 1].start !== 30)) throw new Error("Could not validate every printed start/end time in the dated timetable. Include the full clock column in a sharper image.");
    return rows;
  }

  function borderInk(data, offset) {
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    return shade(data, offset) < 170 || (Math.max(red, green, blue) - Math.min(red, green, blue) > 70 && shade(data, offset) < 235);
  }

  function horizontalBorder(canvas, column, y) {
    const left = Math.ceil(column.left + 3), width = Math.floor(column.right - column.left - 6);
    const top = Math.max(0, Math.floor(y - 2)), height = Math.min(5, canvas.height - top);
    const { data } = canvas.getContext("2d").getImageData(left, top, width, height);
    for (let row = 0; row < height; row++) {
      let ink = 0;
      for (let x = 0; x < width; x++) if (borderInk(data, (row * width + x) * 4)) ink++;
      if (ink > width * .85) return true;
    }
    return false;
  }

  function whiteRow(canvas, column, top, bottom) {
    const context = canvas.getContext("2d"); let white = 0, samples = 0;
    for (const fraction of [.1, .2, .3, .4, .5, .6, .7, .8, .9]) {
      const y = Math.round(top + (bottom - top) * fraction), left = Math.ceil(column.left + (column.right - column.left) * .08);
      const width = Math.floor((column.right - column.left) * .84), { data } = context.getImageData(left, y, width, 1);
      for (let x = 0; x < width; x += 3) { samples++; if (shade(data, x * 4) >= 248) white++; }
    }
    // Dense course text can cover much of a sampled scanline. Empty cells are
    // grey throughout; require substantial white space and complete box borders.
    return white / samples > .4;
  }

  function classRegions(canvas, columns, grid, rows) {
    const regions = []; let grey = 0;
    for (const column of columns) {
      // Include full-width coloured rules between clock rows. Athlete blocks
      // may start halfway down a row; their printed time range is required.
      const left = Math.ceil(column.left + 3), width = Math.floor(column.right - column.left - 6);
      const top = Math.floor(grid.boundaries[0]), height = Math.ceil(grid.boundaries.at(-1)) - top + 1;
      const { data } = canvas.getContext("2d").getImageData(left, top, width, height);
      const rules = [];
      for (let y = 0; y < height; y++) {
        let ink = 0;
        for (let x = 0; x < width; x++) if (borderInk(data, (y * width + x) * 4)) ink++;
        if (ink > width * .85) rules.push(top + y);
      }
      const extra = mergeRules(rules).filter(y => !grid.boundaries.some(boundary => Math.abs(y - boundary) <= 3));
      const boundaries = [...grid.boundaries, ...extra].sort((a, b) => a - b);
      let first = null;
      for (let row = 0; row < boundaries.length - 1; row++) {
        const white = whiteRow(canvas, column, boundaries[row], boundaries[row + 1]);
        if (!white) { grey++; if (first !== null) throw new Error("A dated class has an incomplete bottom border."); continue; }
        if (first === null) {
          if (!horizontalBorder(canvas, column, boundaries[row])) throw new Error("A dated class has an incomplete top border.");
          first = row;
        }
        if (horizontalBorder(canvas, column, boundaries[row + 1])) {
          const firstRow = grid.boundaries.indexOf(boundaries[first]), lastRow = grid.boundaries.indexOf(boundaries[row + 1]);
          regions.push({ ...column, top: boundaries[first], bottom: boundaries[row + 1],
            start: firstRow >= 0 && firstRow < rows.length ? clock(rows[firstRow].start) : null,
            end: lastRow > 0 ? clock(rows[lastRow - 1].end) : null });
          first = null;
        }
      }
      if (first !== null) throw new Error("The bottom of a dated class is cropped.");
    }
    if (!grey || !regions.length || regions.length > 100) throw unsupported("This is not a dated timetable with outlined classes and grey empty rows.");
    return regions;
  }

  function classLines(words) {
    const groups = [];
    for (const word of [...words].sort((a, b) => a.cy - b.cy || a.x0 - b.x0)) {
      const group = groups.find(value => Math.abs(value.cy - word.cy) < Math.max(3, word.height * .4));
      if (group) group.words.push(word);
      else groups.push({ cy: word.cy, words: [word] });
    }
    return groups.map(group => group.words.sort((a, b) => a.x0 - b.x0).map(word => word.text).join(" "))
      .filter(line => !/^Classroom\s*[|:]?$/i.test(line))
      .map(line => line.replace(/\b([A-Z0-9]{3})\s*-\s*([A-Z0-9](?:\s*[A-Z0-9]){2})\s*-\s*([A-Z0-9]{2})\b/gi, (_, a, b, c) => `${a}-${b.replace(/\s/g, "")}-${c}`)
        .replace(/\bs\s*\.\s*(\d+)\b/gi, "sec.$1")
        .replace(/^([A-Z])\s*-\s*(\d{2,4}[A-Z]?)$/i, "Classroom $1-$2"));
  }

  const isBusyLabel = label => /^(?:athletes?\s+(?:student|etudiant)|confli(?:ct|t)\s*\d*)$/i.test(String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const footerHeight = region => Math.min((region.bottom - region.top) * .15, (region.right - region.left) * .1);

  function classFromWords(words, region) {
    // The small Classroom link at the bottom right is not course/staff text,
    // even when OCR misreads its border and spelling.
    words = words.filter(word => !(word.cy > region.bottom - footerHeight(region) && word.cx > region.left + (region.right - region.left) * .6));
    const lines = classLines(words);
    if ((lines.join(" ").match(/\b[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}\b/gi) || []).length > 1) throw new Error("Several courses share an unclear class border. Try a sharper picture so they can be separated.");
    const parsed = globalThis.WhosFreeParser.parseScheduleClassLines(lines);
    const explicit = parsed.explicitTime;
    delete parsed.explicitTime;
    const label = lines.filter(line => !/\b\d{1,2}\s*[:h]\s*\d{2}\s*(?:to|à|a|au|[-–—])/i.test(line)).join(" ");
    const busy = !parsed.course_code && isBusyLabel(label);
    // Explicit hour ranges already take precedence in the older reader. Dates
    // in the headings still never enter these recurring weekday records.
    const times = explicit || { start: region.start, end: region.end };
    if ((busy && !explicit) || !times.start || !times.end || times.end <= times.start) throw Object.assign(new Error("A dated block between clock rows needs a readable start and end time."), { code: "MISSING_DATED_TIMES" });
    if (busy) parsed.course = label;
    const warnings = [];
    if (!parsed.course_code && !busy) warnings.push("Course text is unclear. Check this class against the image.");
    const ambiguousRoom = lines.findIndex(line => /^[1|]\s*-\s*\d{2,4}[A-Z]?$/i.test(line));
    if (ambiguousRoom >= 0) {
      parsed.room = lines[ambiguousRoom].replace(/\s/g, "");
      parsed.instructor = lines.slice(ambiguousRoom + 1).join(" ") || null;
      warnings.push("Check the room's first character: I and 1 may look alike.");
    }
    const scored = words.filter(word => Number.isFinite(word.confidence) && word.confidence >= 0);
    const confidence = scored.length ? scored.reduce((sum, word) => sum + word.confidence, 0) / scored.length : null;
    if (confidence === null || confidence < 75 || scored.some(word => word.confidence < 45)) warnings.push("Check the recognized wording against the picture.");
    if (parsed.course_code && (!parsed.room || !parsed.section)) warnings.push("Check the class room and section against the picture.");
    if (!parsed.course) parsed.course = "Unclear class";
    return { day: region.day, ...times, ...parsed, kind: parsed.course_code ? "class" : "busy_block",
      ...(confidence === null ? {} : { recognition_confidence: Math.round(confidence * 10) / 10 }),
      ...(warnings.length ? { review_warning: warnings.join(" ") } : {}) };
  }

  async function parseScheduleCanvas(canvas, filename, options = {}) {
    const status = options.onProgress || (() => {}), Tesseract = options.Tesseract;
    const base = new URL("assets/ocr/", document.baseURI);
    let worker, failed = false, rejectFailure;
    const failure = new Promise((_, reject) => { rejectFailure = reject; });
    const bounded = async operation => {
      let timeout;
      try { return await Promise.race([operation, failure, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Dated timetable recognition took too long. Try a clearer image.")), 120000); })]); }
      finally { clearTimeout(timeout); }
    };
    try {
      status("Trying the dated weekly timetable reader…");
      const creation = Tesseract.createWorker("eng+fra", 1, { workerPath: new URL("worker.min.js", base).href, corePath: new URL("core/", base).href,
        langPath: new URL("lang/", base).href.replace(/\/$/, ""), workerBlobURL: false,
        errorHandler: error => rejectFailure(new Error(`Dated timetable recognition stopped: ${String(error)}`)) });
      creation.then(value => { if (failed) value.terminate(); }, () => {});
      worker = await bounded(creation);
      const recognize = async (source, rectangle, mode = "11", whitelist = "") => {
        await worker.setParameters({ tessedit_pageseg_mode: mode, tessedit_char_whitelist: whitelist, user_defined_dpi: "300" });
        const result = await bounded(worker.recognize(source, rectangle ? { rectangle } : {}, { blocks: true, text: true }));
        return wordsFromData(result.data);
      };
      const words = await recognize(canvas), headers = datedHeaders(words), columns = detectColumns(canvas, headers), grid = detectRows(canvas, headers, columns);
      let rows = readClockRows(words, grid);
      if (rows.some(row => !row)) {
        status("Reading the dated timetable's printed start and end times…");
        const rectangle = { left: Math.floor(grid.gutterLeft), top: Math.floor(grid.boundaries[0]), width: Math.ceil(grid.gutterRight - grid.gutterLeft), height: Math.min(canvas.height, Math.ceil(grid.boundaries.at(-1))) - Math.floor(grid.boundaries[0]) };
        rows = readClockRows(await recognize(canvas, rectangle, "6", "0123456789:"), grid);
      }
      validateClockRows(rows);
      const regions = classRegions(canvas, columns, grid, rows), classes = [];
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i]; status(`Reading dated weekly class ${i + 1} of ${regions.length}…`);
        const cellWords = words.filter(word => word.cx > region.left + 3 && word.cx < region.right - 3 && word.cy > region.top + 3 && word.cy < region.bottom - 3);
        let item;
        try { item = classFromWords(cellWords, region); }
        catch (error) { if (error.code !== "MISSING_DATED_TIMES") throw error; }
        if (!item || (!item.course_code && !isBusyLabel(item.course)) || item.review_warning) {
          const rectangle = { left: Math.ceil(region.left + 3), top: Math.ceil(region.top + 3), width: Math.floor(region.right - region.left - 6), height: Math.floor(region.bottom - region.top - footerHeight(region) - 3) };
          const retry = await recognize(canvas, rectangle, "6");
          let alternative;
          try { alternative = classFromWords(retry, region); }
          catch (error) { if (!item || error.code !== "MISSING_DATED_TIMES") throw error; }
          const quality = value => (value?.recognition_confidence ?? 0) + (value?.room ? 15 : 0) + (value?.section ? 10 : 0);
          if (alternative && (!item || ((alternative.course_code || isBusyLabel(alternative.course)) && ((!item.course_code && !isBusyLabel(item.course)) || quality(alternative) > quality(item))))) item = alternative;
        }
        classes.push(item);
      }
      if (classes.filter(item => item.course_code || isBusyLabel(item.course)).length < Math.ceil(classes.length * .7)) throw new Error("Too much class text is unclear in this dated timetable. Try a sharper image.");
      return { name: "", person: { source_file: filename, classes }, needsReview: true, reader: "dated-weekly-fallback" };
    } finally {
      failed = true;
      await worker?.terminate();
    }
  }

  function withFallback(primary, loadOcr) {
    return async (canvas, filename, options = {}) => {
      try {
        try { return await primary(canvas, filename, { ...options, releaseSourceCanvas: false }); }
        catch (originalError) {
          if (/recognition (?:could not load|took too long|stalled|stopped)/i.test(originalError.message || "")) throw originalError;
          try { return await api.parseScheduleCanvas(canvas, filename, { ...options, Tesseract: await loadOcr() }); }
          catch (error) {
            if (error.code === "NOT_DATED_LAYOUT") throw originalError;
            throw new Error(`${error.message || "The dated timetable could not be read."} (Dated weekly fallback)`);
          }
        }
      } finally { if (options.releaseSourceCanvas) canvas.width = canvas.height = 1; }
    };
  }

  const api = { parseScheduleCanvas, withFallback, __test: { wordsFromData, datedHeaders, detectColumns, detectRows, readClockRows, validateClockRows, horizontalBorder, whiteRow, classRegions, classFromWords, classLines } };
  globalThis.WhosFreeDatedImageParser = api;
})();
