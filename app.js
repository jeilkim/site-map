(() => {
  const STORAGE_KEY = "site-map.clientId";
  const SITES_KEY = "site-map.sites";
  const LABEL_MODE_KEY = "site-map.labelMode";
  const SIDEBAR_KEY = "site-map.sidebarCollapsed";
  const OVERVIEW_KEY = "site-map.overviewCollapsed";
  const SIDEBAR_WIDTH_KEY = "site-map.sidebarWidth";
  const OVERVIEW_WIDTH_KEY = "site-map.overviewWidth";
  const MAP_TOOLBAR_KEY = "site-map.mapToolbarHidden";
  const ROUTE_KEY = "site-map.routeActive";
  const DEPOT_KEY = "site-map.depot";
  const REPORT_MODE_KEY = "site-map.reportMode";

  /** @typedef {{ id: string, name: string, address: string, note?: string, lat?: number, lng?: number, error?: string }} Site */
  /** @typedef {'number' | 'name' | 'all'} LabelMode */

  /** @type {Site[]} */
  let sites = loadSites();
  /** @type {naver.maps.Map | null} */
  let map = null;
  /** @type {Map<string, { marker: naver.maps.Marker, label: naver.maps.Marker, leaderOutline: naver.maps.Polyline | null, leader: naver.maps.Polyline | null, originDot: naver.maps.Marker | null }>} */
  const overlays = new Map();
  let mapReady = false;
  let collisionTimer = 0;
  /** @type {LabelMode} */
  let labelMode = loadLabelMode();
  let mapToolbarHidden = localStorage.getItem(MAP_TOOLBAR_KEY) === "true";
  let routeActive = localStorage.getItem(ROUTE_KEY) === "true";
  /** @type {{ address: string, lat: number, lng: number } | null} */
  let depot = loadDepot();
  let reportMode = localStorage.getItem(REPORT_MODE_KEY) === "true";
  /** @type {LabelMode | null} */
  let labelModeBeforeReport = null;
  /** @type {{ line: naver.maps.Polyline | null, outline: naver.maps.Polyline | null, badges: naver.maps.Marker[] }} */
  const routeOverlay = { line: null, outline: null, badges: [] };

  const els = {
    app: document.getElementById("app"),
    clientIdInput: document.getElementById("clientIdInput"),
    saveClientIdBtn: document.getElementById("saveClientIdBtn"),
    apiStatus: document.getElementById("apiStatus"),
    apiCard: document.getElementById("apiCard"),
    toggleApiCard: document.getElementById("toggleApiCard"),
    siteForm: document.getElementById("siteForm"),
    siteName: document.getElementById("siteName"),
    siteAddress: document.getElementById("siteAddress"),
    siteNote: document.getElementById("siteNote"),
    reportModeBtn: document.getElementById("reportModeBtn"),
    addSiteBtn: document.getElementById("addSiteBtn"),
    csvInput: document.getElementById("csvInput"),
    csvStatus: document.getElementById("csvStatus"),
    failPanel: document.getElementById("failPanel"),
    failList: document.getElementById("failList"),
    copyFailsBtn: document.getElementById("copyFailsBtn"),
    siteList: document.getElementById("siteList"),
    siteCount: document.getElementById("siteCount"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    overviewToggle: document.getElementById("overviewToggle"),
    leftResizer: document.getElementById("leftResizer"),
    rightResizer: document.getElementById("rightResizer"),
    mapToolbar: document.getElementById("mapToolbar"),
    depotAddress: document.getElementById("depotAddress"),
    setDepotBtn: document.getElementById("setDepotBtn"),
    clearDepotBtn: document.getElementById("clearDepotBtn"),
    depotStatus: document.getElementById("depotStatus"),
    routeToggle: document.getElementById("routeToggle"),
    routePanel: document.getElementById("routePanel"),
    routeSummary: document.getElementById("routeSummary"),
    routeList: document.getElementById("routeList"),
    routeListToggle: document.getElementById("routeListToggle"),
    routeClose: document.getElementById("routeClose"),
    mapToolbarHide: document.getElementById("mapToolbarHide"),
    mapToolbarShow: document.getElementById("mapToolbarShow"),
    screenshotBtn: document.getElementById("screenshotBtn"),
    overviewGrid: document.getElementById("overviewGrid"),
    mapOverlay: document.getElementById("mapOverlay"),
    toast: document.getElementById("toast"),
  };

  /** @type {{ name: string, address: string, reason: string }[]} */
  let lastFailures = [];

  init();

  function init() {
    window.navermap_authFailure = handleAuthFailure;

    const savedId = localStorage.getItem(STORAGE_KEY) || "";
    els.clientIdInput.value = savedId;
    restoreDepotUi();
    syncLabelModeButtons();
    restorePanelWidths();
    if (isMobileLayout()) {
      setSidebarCollapsed(Boolean(savedId), false);
      setOverviewCollapsed(true, false);
    } else {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "true", false);
      setOverviewCollapsed(localStorage.getItem(OVERVIEW_KEY) === "true", false);
    }
    setReportMode(reportMode, false);
    setupPanelResizer(els.leftResizer, "left");
    setupPanelResizer(els.rightResizer, "right");

    els.sidebarToggle.addEventListener("click", () => {
      const opening = els.app.classList.contains("sidebar-collapsed");
      if (isMobileLayout() && opening) setOverviewCollapsed(true, false);
      setSidebarCollapsed(!opening);
    });
    els.overviewToggle.addEventListener("click", () => {
      const opening = els.app.classList.contains("overview-collapsed");
      if (isMobileLayout() && opening) setSidebarCollapsed(true, false);
      setOverviewCollapsed(!opening);
    });
    els.mapToolbarHide.addEventListener("click", () => setMapToolbarHidden(true));
    els.mapToolbarShow.addEventListener("click", () => setMapToolbarHidden(false));
    els.routeToggle.addEventListener("click", () => setRouteActive(!routeActive));
    els.routeListToggle.addEventListener("click", () => {
      setRouteListCollapsed(!els.routePanel.classList.contains("list-collapsed"));
    });
    els.routeClose.addEventListener("click", () => setRouteActive(false));
    els.setDepotBtn.addEventListener("click", setDepotFromInput);
    els.clearDepotBtn.addEventListener("click", clearDepot);
    els.reportModeBtn.addEventListener("click", () => setReportMode(!reportMode));
    els.screenshotBtn.addEventListener("click", captureMapAndOverview);

    els.saveClientIdBtn.addEventListener("click", () => {
      const clientId = els.clientIdInput.value.trim();
      if (!clientId) {
        setStatus(els.apiStatus, "Client ID를 입력해 주세요.", "error");
        return;
      }
      localStorage.setItem(STORAGE_KEY, clientId);
      loadNaverMaps(clientId);
    });

    els.toggleApiCard.addEventListener("click", () => {
      const bodyHidden = els.apiCard.classList.toggle("collapsed");
      els.toggleApiCard.textContent = bodyHidden ? "펼치기" : "접기";
      [...els.apiCard.children].forEach((child, idx) => {
        if (idx === 0) return;
        child.hidden = bodyHidden;
      });
    });

    els.siteForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = els.siteName.value.trim();
      const address = els.siteAddress.value.trim();
      const note = els.siteNote.value.trim();
      if (!name || !address) return;

      els.addSiteBtn.disabled = true;
      try {
        await addSite({ name, address, note });
        els.siteForm.reset();
        els.siteName.focus();
      } finally {
        els.addSiteBtn.disabled = false;
      }
    });

    els.csvInput.addEventListener("change", async () => {
      const file = els.csvInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = parseCsv(text);
        if (!rows.length) {
          setStatus(els.csvStatus, "유효한 행이 없습니다. 헤더: 현장명,주소", "error");
          renderFailures([]);
          return;
        }
        setStatus(els.csvStatus, `${rows.length}건 처리 중...`);
        renderFailures([]);
        let ok = 0;
        /** @type {{ name: string, address: string, reason: string }[]} */
        const failures = [];
        for (const row of rows) {
          const result = await addSite(row, { silent: true });
          if (result.ok) ok += 1;
          else failures.push({ name: row.name, address: row.address, reason: result.reason });
        }
        setStatus(
          els.csvStatus,
          `완료: 성공 ${ok}건` + (failures.length ? `, 실패 ${failures.length}건` : ""),
          failures.length ? "error" : "ok"
        );
        renderFailures(failures);
        showToast(`CSV 업로드 완료 (성공 ${ok} / 실패 ${failures.length})`);
        fitBounds();
        refreshRouteIfActive();
      } catch (err) {
        setStatus(els.csvStatus, err.message || "CSV 처리 실패", "error");
        renderFailures([]);
      } finally {
        els.csvInput.value = "";
      }
    });

    els.copyFailsBtn.addEventListener("click", async () => {
      if (!lastFailures.length) return;
      const text = lastFailures
        .map((f) => `${f.name}\t${f.address}\t${f.reason}`)
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
        showToast("실패 목록을 복사했습니다.");
      } catch {
        showToast("복사에 실패했습니다.");
      }
    });

    els.mapToolbar.querySelectorAll("[data-label-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-label-mode");
        if (mode !== "number" && mode !== "name" && mode !== "all") return;
        setLabelMode(mode);
      });
    });

    els.clearAllBtn.addEventListener("click", () => {
      if (!sites.length) return;
      if (!confirm("등록된 현장을 모두 삭제할까요?")) return;
      sites = [];
      saveSites();
      clearOverlays();
      renderList();
      refreshRouteIfActive();
      showToast("전체 삭제되었습니다.");
    });

    renderList();

    if (savedId) {
      loadNaverMaps(savedId);
    }
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function setReportMode(active, animate = true) {
    reportMode = active;
    localStorage.setItem(REPORT_MODE_KEY, String(active));
    els.app.classList.toggle("report-mode", active);
    els.reportModeBtn.classList.toggle("is-active", active);
    els.reportModeBtn.textContent = active ? "PPT 모드 끄기" : "PPT 모드";

    if (active) {
      setSidebarCollapsed(true, false);
      setOverviewCollapsed(false, false);
      setRouteListCollapsed(true);
      if (labelMode !== "number") {
        labelModeBeforeReport = labelMode;
        setLabelMode("number");
      } else {
        labelModeBeforeReport = "number";
      }
    } else if (labelModeBeforeReport && labelModeBeforeReport !== labelMode) {
      const restore = labelModeBeforeReport;
      labelModeBeforeReport = null;
      setLabelMode(restore);
    }

    renderOverview();

    if (!animate || !map) return;
    const center = map.getCenter();
    window.setTimeout(() => {
      naver.maps.Event.trigger(map, "resize");
      map.setCenter(center);
      scheduleNumberLayout();
    }, 240);
  }

  function setRouteListCollapsed(collapsed) {
    els.routePanel.classList.toggle("list-collapsed", collapsed);
    els.routeListToggle.textContent = collapsed ? "목록 보기" : "목록 접기";
    els.routeListToggle.setAttribute("aria-expanded", String(!collapsed));
  }

  function setSidebarCollapsed(collapsed, animate = true) {
    els.app.classList.toggle("sidebar-collapsed", collapsed);
    els.sidebarToggle.textContent = collapsed ? "›" : "‹";
    els.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    els.sidebarToggle.setAttribute(
      "aria-label",
      collapsed ? "왼쪽 패널 펼치기" : "왼쪽 패널 접기"
    );
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));

    if (!animate || !map) return;
    const center = map.getCenter();
    window.setTimeout(() => {
      naver.maps.Event.trigger(map, "resize");
      map.setCenter(center);
      scheduleNumberLayout();
    }, 240);
  }

  function setOverviewCollapsed(collapsed, animate = true) {
    els.app.classList.toggle("overview-collapsed", collapsed);
    els.overviewToggle.textContent = collapsed ? "‹" : "›";
    els.overviewToggle.setAttribute("aria-expanded", String(!collapsed));
    els.overviewToggle.setAttribute(
      "aria-label",
      collapsed ? "오른쪽 현장 표 펼치기" : "오른쪽 현장 표 접기"
    );
    localStorage.setItem(OVERVIEW_KEY, String(collapsed));

    if (!animate || !map) return;
    const center = map.getCenter();
    window.setTimeout(() => {
      naver.maps.Event.trigger(map, "resize");
      map.setCenter(center);
      scheduleNumberLayout();
    }, 240);
  }

  function setMapToolbarHidden(hidden) {
    mapToolbarHidden = hidden;
    localStorage.setItem(MAP_TOOLBAR_KEY, String(hidden));
    els.mapToolbar.hidden = hidden;
    els.mapToolbarShow.hidden = !hidden;
  }

  async function captureMapAndOverview() {
    if (!mapReady) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast("이 브라우저에서는 화면 캡처를 지원하지 않습니다.");
      return;
    }

    const wasReportMode = reportMode;
    const overviewWasCollapsed = els.app.classList.contains("overview-collapsed");
    const sidebarWasCollapsed = els.app.classList.contains("sidebar-collapsed");
    let stream = null;
    els.screenshotBtn.disabled = true;

    // A4 landscape @ 300dpi — good enough for print / PPT insert
    const A4_WIDTH = 3508;
    const A4_HEIGHT = 2480;

    try {
      setReportMode(true, false);
      setSidebarCollapsed(true, false);
      setOverviewCollapsed(false, false);
      els.app.classList.add("is-a4-export");
      if (map) {
        naver.maps.Event.trigger(map, "resize");
        scheduleNumberLayout();
      }
      await delay(280);

      showToast("공유 창에서 현재 탭을 선택해 주세요. (A4 고화질 저장)");
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      });

      const track = stream.getVideoTracks()[0];
      const displaySurface = track?.getSettings?.().displaySurface;
      if (displaySurface && displaySurface !== "browser") {
        throw new Error("공유 창에서 '현재 탭'을 선택해 주세요.");
      }
      try {
        await track.applyConstraints({
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        });
      } catch {
        // Some browsers keep the tab's native resolution, which is still usable.
      }

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error("캡처 화면을 불러오지 못했습니다."));
      });
      await video.play();

      els.app.classList.add("is-capturing");
      if (map) {
        naver.maps.Event.trigger(map, "resize");
        scheduleNumberLayout();
      }
      await delay(320);

      const mapRect = document.querySelector(".map-panel").getBoundingClientRect();
      const overviewRect = document.querySelector(".site-overview").getBoundingClientRect();
      const scaleX = video.videoWidth / window.innerWidth;
      const scaleY = video.videoHeight / window.innerHeight;
      const sourceX = Math.max(0, mapRect.left * scaleX);
      const sourceY = Math.max(0, mapRect.top * scaleY);
      const sourceWidth = Math.min(
        video.videoWidth - sourceX,
        Math.max(mapRect.width, overviewRect.width) * scaleX
      );
      const sourceHeight = Math.min(
        video.videoHeight - sourceY,
        (overviewRect.bottom - mapRect.top) * scaleY
      );

      const canvas = document.createElement("canvas");
      canvas.width = A4_WIDTH;
      canvas.height = A4_HEIGHT;
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

      const fit = Math.min(A4_WIDTH / sourceWidth, A4_HEIGHT / sourceHeight);
      const drawWidth = sourceWidth * fit;
      const drawHeight = sourceHeight * fit;
      const drawX = (A4_WIDTH - drawWidth) / 2;
      const drawY = (A4_HEIGHT - drawHeight) / 2;
      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("PNG 파일을 만들지 못했습니다.");

      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.href = URL.createObjectURL(blob);
      link.download = `현장지도-A4-${timestamp}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast("A4(가로) 고화질 PNG로 저장했습니다.");
    } catch (error) {
      if (error?.name !== "NotAllowedError") {
        showToast(error?.message || "스크린샷 저장에 실패했습니다.");
      }
    } finally {
      els.app.classList.remove("is-capturing");
      els.app.classList.remove("is-a4-export");
      stream?.getTracks().forEach((track) => track.stop());
      els.screenshotBtn.disabled = false;
      setReportMode(wasReportMode, false);
      setSidebarCollapsed(sidebarWasCollapsed, false);
      setOverviewCollapsed(overviewWasCollapsed, false);
      if (map) {
        window.setTimeout(() => {
          naver.maps.Event.trigger(map, "resize");
          scheduleNumberLayout();
        }, 240);
      }
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function restorePanelWidths() {
    const sidebarWidth = clamp(
      Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || 380,
      260,
      520
    );
    const overviewWidth = clamp(
      Number(localStorage.getItem(OVERVIEW_WIDTH_KEY)) || 500,
      360,
      700
    );
    els.app.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    els.app.style.setProperty("--overview-width", `${overviewWidth}px`);
  }

  function setupPanelResizer(handle, side) {
    let dragging = false;
    let mapCenter = null;
    let resizeFrame = 0;

    handle.addEventListener("pointerdown", (event) => {
      dragging = true;
      mapCenter = map?.getCenter() || null;
      handle.setPointerCapture(event.pointerId);
      els.app.classList.add("is-resizing");
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const rect = els.app.getBoundingClientRect();
      const styles = getComputedStyle(els.app);
      const otherCollapsed =
        side === "left"
          ? els.app.classList.contains("overview-collapsed")
          : els.app.classList.contains("sidebar-collapsed");
      const otherWidth = otherCollapsed
        ? 0
        : parseFloat(
            styles.getPropertyValue(
              side === "left" ? "--overview-width" : "--sidebar-width"
            )
          );
      const requested =
        side === "left" ? event.clientX - rect.left : rect.right - event.clientX;
      const minimum = side === "left" ? 260 : 360;
      const absoluteMaximum = side === "left" ? 520 : 700;
      const availableMaximum = Math.max(minimum, rect.width - otherWidth - 320);
      const width = clamp(requested, minimum, Math.min(absoluteMaximum, availableMaximum));
      const property = side === "left" ? "--sidebar-width" : "--overview-width";
      const storageKey = side === "left" ? SIDEBAR_WIDTH_KEY : OVERVIEW_WIDTH_KEY;

      els.app.style.setProperty(property, `${Math.round(width)}px`);
      localStorage.setItem(storageKey, String(Math.round(width)));

      if (!resizeFrame) {
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          if (!map) return;
          naver.maps.Event.trigger(map, "resize");
          if (mapCenter) map.setCenter(mapCenter);
        });
      }
    });

    const finish = (event) => {
      if (!dragging) return;
      dragging = false;
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      els.app.classList.remove("is-resizing");
      scheduleNumberLayout();
    };

    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);

    handle.addEventListener("dblclick", () => {
      const width = side === "left" ? 380 : 500;
      const property = side === "left" ? "--sidebar-width" : "--overview-width";
      const storageKey = side === "left" ? SIDEBAR_WIDTH_KEY : OVERVIEW_WIDTH_KEY;
      els.app.style.setProperty(property, `${width}px`);
      localStorage.setItem(storageKey, String(width));
      if (map) {
        naver.maps.Event.trigger(map, "resize");
        scheduleNumberLayout();
      }
    });
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function loadNaverMaps(clientId) {
    if (window.naver?.maps) {
      onMapsReady();
      return;
    }

    const existing = document.querySelector("script[data-naver-maps]");
    if (existing) existing.remove();

    setStatus(els.apiStatus, "네이버 지도 SDK 로딩 중...");
    const script = document.createElement("script");
    script.dataset.naverMaps = "1";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
      clientId
    )}&submodules=geocoder`;
    script.async = true;
    script.onload = () => onMapsReady();
    script.onerror = () => {
      mapReady = false;
      els.mapOverlay.classList.remove("hidden");
      els.mapToolbar.hidden = true;
      setStatus(
        els.apiStatus,
        "지도 SDK 로드 실패. Client ID와 도메인 등록을 확인해 주세요.",
        "error"
      );
    };
    document.head.appendChild(script);
  }

  function handleAuthFailure() {
    mapReady = false;
    map = null;
    els.mapOverlay.classList.remove("hidden");
    els.mapToolbar.hidden = true;
    els.screenshotBtn.disabled = true;
    updateRouteButton();

    const origin = window.location.origin;
    const overlayCard = els.mapOverlay.querySelector(".overlay-card");
    if (overlayCard) {
      overlayCard.innerHTML = `
        <h2>네이버 지도 인증 실패</h2>
        <p>
          Client ID는 맞지만 이 사이트 도메인이 등록되어 있지 않습니다.<br />
          NCP 콘솔 → Maps 애플리케이션 → <strong>Web 서비스 URL</strong>에
          아래 도메인을 추가한 뒤 다시 시도하세요. (포트·경로 제외, 호스트만)
        </p>
        <p class="overlay-domain">${escapeHtml(origin)}</p>`;
    }
    setStatus(
      els.apiStatus,
      `인증 실패: NCP 콘솔 Web 서비스 URL에 ${origin} 을(를) 등록해 주세요.`,
      "error"
    );
    showToast("네이버 지도 인증 실패 — 도메인 등록을 확인하세요.");
  }

  function onMapsReady() {
    if (!window.naver?.maps) {
      setStatus(els.apiStatus, "네이버 지도 객체를 찾을 수 없습니다.", "error");
      return;
    }

    map = new naver.maps.Map("map", {
      center: new naver.maps.LatLng(37.5665, 126.978),
      zoom: 11,
      maxZoom: 21,
      zoomControl: true,
      zoomControlOptions: {
        position: naver.maps.Position.TOP_RIGHT,
      },
    });

    mapReady = true;
    els.mapOverlay.classList.add("hidden");
    setMapToolbarHidden(mapToolbarHidden);
    els.screenshotBtn.disabled = false;
    if (isMobileLayout()) setSidebarCollapsed(true, false);
    setStatus(els.apiStatus, "지도 준비 완료. 현장명과 주소를 추가하세요.", "ok");
    showToast("네이버 지도가 준비되었습니다.");

    clearOverlays();
    sites.forEach((site) => plotSite(site));
    fitBounds();
    naver.maps.Event.addListener(map, "idle", scheduleNumberLayout);
    updateRouteButton();
    if (routeActive) refreshRoute();
  }

  /**
   * @param {{ name: string, address: string, note?: string }} input
   * @param {{ silent?: boolean }} [opts]
   * @returns {Promise<{ ok: true, site: Site } | { ok: false, reason: string }>}
   */
  async function addSite(input, opts = {}) {
    const site = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      address: input.address.trim(),
      note: (input.note || "").trim(),
    };

    if (!mapReady) {
      const msg = "먼저 Client ID를 저장해 지도를 불러와 주세요.";
      if (!opts.silent) showToast(msg);
      setStatus(els.apiStatus, msg, "error");
      return { ok: false, reason: msg };
    }

    try {
      const coords = await geocode(site.address);
      site.lat = coords.lat;
      site.lng = coords.lng;
      sites.push(site);
      saveSites();
      plotSite(site);
      renderList();
      if (!opts.silent) refreshRouteIfActive();
      if (!opts.silent) {
        showToast(`「${site.name}」 추가됨`);
        map.setCenter(new naver.maps.LatLng(site.lat, site.lng));
        map.setZoom(Math.max(map.getZoom(), 18));
      }
      return { ok: true, site };
    } catch (err) {
      const reason = err?.message || "주소 변환 실패";
      if (!opts.silent) showToast(reason);
      console.error(err);
      return { ok: false, reason };
    }
  }

  /** @param {{ name: string, address: string, reason: string }[]} failures */
  function renderFailures(failures) {
    lastFailures = failures;
    if (!failures.length) {
      els.failPanel.hidden = true;
      els.failList.innerHTML = "";
      return;
    }

    els.failPanel.hidden = false;
    els.failList.innerHTML = failures
      .map(
        (f) => `
        <li class="fail-item">
          <strong>${escapeHtml(f.name)}</strong>
          <span>${escapeHtml(f.address)}</span>
          <em>${escapeHtml(f.reason)}</em>
        </li>`
      )
      .join("");
  }

  function geocode(address) {
    return new Promise((resolve, reject) => {
      if (!window.naver?.maps?.Service) {
        reject(new Error("Geocoder를 사용할 수 없습니다. geocoder 서브모듈을 확인하세요."));
        return;
      }

      naver.maps.Service.geocode({ query: address }, (status, response) => {
        if (status !== naver.maps.Service.Status.OK) {
          reject(new Error("주소를 찾을 수 없습니다"));
          return;
        }

        const item = response?.v2?.addresses?.[0];
        if (!item) {
          reject(new Error("주소를 찾을 수 없습니다"));
          return;
        }

        resolve({
          lat: Number(item.y),
          lng: Number(item.x),
        });
      });
    });
  }

  /** @param {Site} site */
  function plotSite(site) {
    if (!map || site.lat == null || site.lng == null) return;

    const position = new naver.maps.LatLng(site.lat, site.lng);
    const showDefaultPin = labelMode === "all";

    const marker = new naver.maps.Marker({
      position,
      map: showDefaultPin ? map : null,
      title: site.name,
    });

    const label = new naver.maps.Marker({
      position,
      map,
      icon: {
        content: buildLabelHtml(site),
        anchor: labelAnchorForMode(labelMode),
      },
    });

    const focus = () => {
      map.setCenter(position);
      map.setZoom(Math.max(map.getZoom(), 18));
    };

    marker.addListener("click", focus);
    label.addListener("click", focus);

    overlays.set(site.id, {
      marker,
      label,
      leaderOutline: null,
      leader: null,
      originDot: null,
    });
    scheduleNumberLayout();
  }

  /** @param {LabelMode} mode */
  function setLabelMode(mode) {
    if (labelMode === mode) return;
    labelMode = mode;
    localStorage.setItem(LABEL_MODE_KEY, mode);
    syncLabelModeButtons();
    refreshLabels();
  }

  function syncLabelModeButtons() {
    els.mapToolbar.querySelectorAll("[data-label-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-label-mode") === labelMode);
    });
  }

  function refreshLabels() {
    if (!mapReady) return;
    clearOverlays();
    sites.forEach((site) => plotSite(site));
    scheduleNumberLayout();
  }

  /** @param {Site} site */
  function siteOrderNumber(site) {
    const idx = sites.findIndex((s) => s.id === site.id);
    return idx >= 0 ? idx + 1 : 0;
  }

  /** @param {Site | string} siteOrName */
  function siteDisplayName(siteOrName) {
    const fullName = typeof siteOrName === "string" ? siteOrName : siteOrName.name;
    const match = String(fullName).match(/^\d+\.\s*(.+)$/);
    return match ? match[1] : fullName;
  }

  /** @param {string} fullName */
  function splitSiteName(fullName) {
    const match = String(fullName).match(/^(\d+)\.\s*(.+)$/);
    if (!match) return { number: "", name: fullName };
    return { number: match[1], name: match[2] };
  }

  /** @param {Site} site */
  function formatLabelText(site) {
    const number = String(siteOrderNumber(site));
    const name = siteDisplayName(site);
    if (labelMode === "number") return number;
    if (labelMode === "name") return name;
    return `${number}. ${name}`;
  }

  /** @param {Site} site */
  function buildLabelHtml(site) {
    return `<div class="site-label mode-${labelMode}">${escapeHtml(formatLabelText(site))}</div>`;
  }

  /** @param {LabelMode} mode */
  function labelAnchorForMode(mode) {
    if (mode === "number") return new naver.maps.Point(15, 15);
    return new naver.maps.Point(0, 48);
  }

  function scheduleNumberLayout() {
    window.clearTimeout(collisionTimer);
    collisionTimer = window.setTimeout(layoutNumberLabels, 80);
  }

  function layoutNumberLabels() {
    if (!map || labelMode !== "number") return;

    const projection = map.getProjection();
    if (!projection) return;

    const LABEL_CLEARANCE = 34;
    const ORIGIN_CLEARANCE = 24;

    const entries = sites
      .filter((site) => site.lat != null && site.lng != null && overlays.has(site.id))
      .map((site) => {
        const origin = new naver.maps.LatLng(site.lat, site.lng);
        return {
          site,
          overlay: overlays.get(site.id),
          origin,
          originPoint: projection.fromCoordToOffset(origin),
          labelPoint: null,
        };
      })
      .sort((a, b) => siteNumber(a.site) - siteNumber(b.site));

    const origins = entries.map((entry) => entry.originPoint);
    /** @type {{ x: number, y: number }[]} */
    const occupiedLabels = [];

    entries.forEach((entry) => {
      const { overlay } = entry;
      if (!overlay) return;
      if (overlay.leaderOutline) {
        overlay.leaderOutline.setMap(null);
        overlay.leaderOutline = null;
      }
      if (overlay.leader) {
        overlay.leader.setMap(null);
        overlay.leader = null;
      }
      if (overlay.originDot) {
        overlay.originDot.setMap(null);
        overlay.originDot = null;
      }

      // Always keep the real location visible as a red dot.
      overlay.originDot = new naver.maps.Marker({
        position: entry.origin,
        map,
        icon: {
          content: '<div class="leader-origin-dot"></div>',
          anchor: new naver.maps.Point(6, 6),
        },
        zIndex: 100,
      });

      const labelPoint = findLabelPointAwayFromOrigins(
        entry.originPoint,
        origins,
        occupiedLabels,
        ORIGIN_CLEARANCE,
        LABEL_CLEARANCE
      );
      entry.labelPoint = labelPoint;
      occupiedLabels.push(labelPoint);

      const labelPosition = projection.fromOffsetToCoord(labelPoint);
      overlay.label.setPosition(labelPosition);

      const moved =
        Math.hypot(labelPoint.x - entry.originPoint.x, labelPoint.y - entry.originPoint.y) > 1;
      if (moved) drawShortLeader(entry, projection);
    });
  }

  function siteNumber(site) {
    return siteOrderNumber(site);
  }

  function isClearOfPoints(point, points, clearance) {
    return points.every(
      (other) => Math.hypot(point.x - other.x, point.y - other.y) >= clearance
    );
  }

  function findLabelPointAwayFromOrigins(
    origin,
    origins,
    occupiedLabels,
    originClearance,
    labelClearance
  ) {
    const fits = (x, y) => {
      const point = { x, y };
      return (
        isClearOfPoints(point, origins, originClearance) &&
        isClearOfPoints(point, occupiedLabels, labelClearance)
      );
    };

    // Prefer nearby empty spots around the real location, never on any red origin.
    for (let radius = 28; radius <= 160; radius += 12) {
      const count = Math.max(10, Math.round((Math.PI * 2 * radius) / 16));
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
        const x = Math.round(origin.x + Math.cos(angle) * radius);
        const y = Math.round(origin.y + Math.sin(angle) * radius);
        if (fits(x, y)) return new naver.maps.Point(x, y);
      }
    }

    return new naver.maps.Point(origin.x, origin.y - 170);
  }

  function drawShortLeader(entry, projection) {
    const dx = entry.originPoint.x - entry.labelPoint.x;
    const dy = entry.originPoint.y - entry.labelPoint.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const unitX = dx / distance;
    const unitY = dy / distance;
    const labelEdge = new naver.maps.Point(
      entry.labelPoint.x + unitX * 14,
      entry.labelPoint.y + unitY * 14
    );
    const originEdge = new naver.maps.Point(
      entry.originPoint.x - unitX * 7,
      entry.originPoint.y - unitY * 7
    );
    const path = [
      projection.fromOffsetToCoord(originEdge),
      projection.fromOffsetToCoord(labelEdge),
    ];
    entry.overlay.leaderOutline = new naver.maps.Polyline({
      map,
      path,
      strokeColor: "#ffffff",
      strokeWeight: 5,
      strokeOpacity: 0.9,
      zIndex: 89,
    });
    entry.overlay.leader = new naver.maps.Polyline({
      map,
      path,
      strokeColor: "#ef4444",
      strokeWeight: 2,
      strokeOpacity: 0.9,
      zIndex: 90,
    });
  }
  function removeSite(id) {
    sites = sites.filter((s) => s.id !== id);
    saveSites();
    const overlay = overlays.get(id);
    if (overlay) {
      overlay.marker.setMap(null);
      overlay.label.setMap(null);
      overlay.leaderOutline?.setMap(null);
      overlay.leader?.setMap(null);
      overlay.originDot?.setMap(null);
      overlays.delete(id);
    }
    renderList();
    scheduleNumberLayout();
    refreshRouteIfActive();
  }

  // ---------------------------------------------------------------------------
  // 최적 동선 (route recommendation)
  // Straight-line (haversine) 거리를 기준으로 방문 순서를 근사 최적화합니다.
  // 정확한 도로 거리는 아니고 "추천" 용도의 근사치입니다.
  // ---------------------------------------------------------------------------

  function updateRouteButton() {
    const usable = routableSites().length;
    const minSites = depot ? 1 : 2;
    const enabled = mapReady && usable >= minSites;
    els.routeToggle.disabled = !enabled;
    els.routeToggle.classList.toggle("is-active", routeActive && enabled);
    if (routeActive && !enabled) {
      // Not enough points to keep a route on screen.
      clearRoute();
      els.routePanel.hidden = true;
    }
  }

  /** @returns {Site[]} sites that have coordinates, in registration order */
  function routableSites() {
    return sites.filter((s) => s.lat != null && s.lng != null);
  }

  function setRouteActive(active) {
    routeActive = active;
    localStorage.setItem(ROUTE_KEY, String(active));
    els.routeToggle.classList.toggle("is-active", active);
    if (active) {
      refreshRoute();
    } else {
      clearRoute();
      els.routePanel.hidden = true;
    }
  }

  function refreshRouteIfActive() {
    if (routeActive) refreshRoute();
  }

  function refreshRoute() {
    if (!mapReady) return;
    const points = routableSites();
    const minSites = depot ? 1 : 2;
    if (points.length < minSites) {
      clearRoute();
      els.routePanel.hidden = true;
      return;
    }
    const result = computeOptimalRoute(points, depot);
    drawRoute(result);
    renderRoutePanel(result);
  }

  function loadDepot() {
    try {
      const raw = localStorage.getItem(DEPOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  function saveDepot() {
    if (depot) localStorage.setItem(DEPOT_KEY, JSON.stringify(depot));
    else localStorage.removeItem(DEPOT_KEY);
  }

  function restoreDepotUi() {
    if (depot) {
      els.depotAddress.value = depot.address;
      setStatus(els.depotStatus, "출발·도착 위치가 설정되어 있습니다.", "ok");
    }
  }

  async function setDepotFromInput() {
    const address = els.depotAddress.value.trim();
    if (!address) {
      setStatus(els.depotStatus, "주소를 입력해 주세요.", "error");
      return;
    }
    if (!mapReady) {
      setStatus(els.depotStatus, "먼저 Client ID를 저장해 지도를 불러와 주세요.", "error");
      return;
    }
    els.setDepotBtn.disabled = true;
    setStatus(els.depotStatus, "주소 변환 중...");
    try {
      const coords = await geocode(address);
      depot = { address, lat: coords.lat, lng: coords.lng };
      saveDepot();
      setStatus(els.depotStatus, "출발·도착 위치가 설정되었습니다.", "ok");
      showToast("출발·도착 위치가 설정되었습니다.");
      updateRouteButton();
      refreshRouteIfActive();
    } catch (err) {
      setStatus(els.depotStatus, err?.message || "주소 변환 실패", "error");
    } finally {
      els.setDepotBtn.disabled = false;
    }
  }

  function clearDepot() {
    depot = null;
    saveDepot();
    els.depotAddress.value = "";
    setStatus(els.depotStatus, "출발·도착 위치를 해제했습니다.");
    updateRouteButton();
    refreshRouteIfActive();
  }

  /**
   * @param {Site[]} points
   * @param {{ address: string, lat: number, lng: number } | null} [depotPoint]
   * @returns {{ order: Site[], totalKm: number, isLoop: boolean, depot: any }}
   */
  function computeOptimalRoute(points, depotPoint) {
    if (depotPoint) return computeLoopRoute(points, depotPoint);
    return computeOpenRoute(points);
  }

  /**
   * Open-path TSP heuristic: nearest-neighbour from several start points,
   * each improved with 2-opt, keeping the shortest total.
   * @param {Site[]} points
   */
  function computeOpenRoute(points) {
    const n = points.length;
    const dist = buildDistanceMatrix(points);

    const starts = pickStarts(n);
    let best = null;
    let bestLen = Infinity;
    for (const start of starts) {
      const nn = nearestNeighbourPath(dist, n, start);
      const improved = twoOpt(nn, dist);
      const len = pathLength(improved, dist);
      if (len < bestLen) {
        bestLen = len;
        best = improved;
      }
    }

    return {
      order: best.map((i) => points[i]),
      totalKm: bestLen,
      isLoop: false,
      depot: null,
    };
  }

  /**
   * Closed-loop TSP with a fixed start/end depot (index 0).
   * depot -> sites -> depot.
   * @param {Site[]} points
   * @param {{ address: string, lat: number, lng: number }} depotPoint
   */
  function computeLoopRoute(points, depotPoint) {
    const nodes = [depotPoint, ...points];
    const n = nodes.length;
    const dist = buildDistanceMatrix(nodes);

    const nn = nearestNeighbourPath(dist, n, 0);
    const improved = twoOptCycle(nn, dist);
    const totalKm = cycleLength(improved, dist);

    // Rotate so depot (node 0) is first, keep visiting direction.
    const startIdx = improved.indexOf(0);
    const rotated = improved.slice(startIdx).concat(improved.slice(0, startIdx));
    const order = rotated.slice(1).map((i) => nodes[i]);

    return { order, totalKm, isLoop: true, depot: depotPoint };
  }

  function buildDistanceMatrix(nodes) {
    const n = nodes.length;
    const dist = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const d = haversineKm(nodes[i], nodes[j]);
        dist[i][j] = d;
        dist[j][i] = d;
      }
    }
    return dist;
  }

  function pickStarts(n) {
    if (n <= 40) return Array.from({ length: n }, (_, i) => i);
    const step = Math.ceil(n / 20);
    const starts = [];
    for (let i = 0; i < n; i += step) starts.push(i);
    return starts;
  }

  function nearestNeighbourPath(dist, n, start) {
    const visited = new Array(n).fill(false);
    const path = [start];
    visited[start] = true;
    let current = start;
    for (let step = 1; step < n; step += 1) {
      let next = -1;
      let nextDist = Infinity;
      for (let j = 0; j < n; j += 1) {
        if (!visited[j] && dist[current][j] < nextDist) {
          nextDist = dist[current][j];
          next = j;
        }
      }
      visited[next] = true;
      path.push(next);
      current = next;
    }
    return path;
  }

  function twoOpt(path, dist) {
    const route = path.slice();
    const n = route.length;
    let improved = true;
    let guard = 0;
    while (improved && guard < 60) {
      improved = false;
      guard += 1;
      for (let i = 0; i < n - 1; i += 1) {
        for (let k = i + 1; k < n; k += 1) {
          const a = route[i - 1];
          const b = route[i];
          const c = route[k];
          const d = route[k + 1];
          const before =
            (a === undefined ? 0 : dist[a][b]) +
            (d === undefined ? 0 : dist[c][d]);
          const after =
            (a === undefined ? 0 : dist[a][c]) +
            (d === undefined ? 0 : dist[b][d]);
          if (after + 1e-9 < before) {
            reverseSegment(route, i, k);
            improved = true;
          }
        }
      }
    }
    return route;
  }

  function reverseSegment(route, i, k) {
    while (i < k) {
      const tmp = route[i];
      route[i] = route[k];
      route[k] = tmp;
      i += 1;
      k -= 1;
    }
  }

  function pathLength(path, dist) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i += 1) {
      total += dist[path[i]][path[i + 1]];
    }
    return total;
  }

  // Closed-loop 2-opt keeping index at position 0 (depot) fixed.
  function twoOptCycle(path, dist) {
    const route = path.slice();
    const n = route.length;
    let improved = true;
    let guard = 0;
    while (improved && guard < 60) {
      improved = false;
      guard += 1;
      for (let i = 1; i < n - 1; i += 1) {
        for (let k = i + 1; k < n; k += 1) {
          const a = route[i - 1];
          const b = route[i];
          const c = route[k];
          const d = route[(k + 1) % n];
          const before = dist[a][b] + dist[c][d];
          const after = dist[a][c] + dist[b][d];
          if (after + 1e-9 < before) {
            reverseSegment(route, i, k);
            improved = true;
          }
        }
      }
    }
    return route;
  }

  function cycleLength(route, dist) {
    let total = 0;
    const n = route.length;
    for (let i = 0; i < n; i += 1) {
      total += dist[route[i]][route[(i + 1) % n]];
    }
    return total;
  }

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** @param {{ order: Site[], isLoop: boolean, depot: any }} result */
  function drawRoute(result) {
    clearRoute();
    if (!map) return;

    const { order, isLoop, depot: depotPoint } = result;
    const stops = isLoop && depotPoint ? [depotPoint, ...order] : order;
    if (stops.length < 2) return;

    const coords = stops.map((s) => new naver.maps.LatLng(s.lat, s.lng));
    // For a loop, close the line back to the depot.
    const path = isLoop && depotPoint ? [...coords, coords[0]] : coords;

    routeOverlay.outline = new naver.maps.Polyline({
      map,
      path,
      strokeColor: "#ffffff",
      strokeWeight: 8,
      strokeOpacity: 0.9,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      zIndex: 60,
    });
    routeOverlay.line = new naver.maps.Polyline({
      map,
      path,
      strokeColor: "#4da3ff",
      strokeWeight: 4,
      strokeOpacity: 0.95,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      zIndex: 61,
    });

    if (isLoop && depotPoint) {
      routeOverlay.badges.push(
        makeBadgeMarker(depotPoint, `<div class="route-badge depot">출발·도착</div>`, 12)
      );
    }
    order.forEach((site, index) => {
      routeOverlay.badges.push(
        makeBadgeMarker(site, `<div class="route-badge">${index + 1}</div>`)
      );
    });
  }

  function makeBadgeMarker(point, content, anchorX = 13) {
    return new naver.maps.Marker({
      position: new naver.maps.LatLng(point.lat, point.lng),
      map,
      icon: {
        content,
        anchor: new naver.maps.Point(anchorX, 30),
      },
      zIndex: 120,
    });
  }

  function clearRoute() {
    routeOverlay.line?.setMap(null);
    routeOverlay.outline?.setMap(null);
    routeOverlay.line = null;
    routeOverlay.outline = null;
    routeOverlay.badges.forEach((b) => b.setMap(null));
    routeOverlay.badges = [];
  }

  /** @param {{ order: Site[], totalKm: number, isLoop: boolean, depot: any }} result */
  function renderRoutePanel(result) {
    els.routePanel.hidden = false;
    const km = result.totalKm;
    const distanceText = km >= 10 ? `${km.toFixed(0)}km` : `${km.toFixed(1)}km`;
    const suffix = result.isLoop ? "왕복, 직선거리" : "직선거리";
    els.routeSummary.textContent = `${result.order.length}곳 · 약 ${distanceText} (${suffix})`;

    const items = [];
    if (result.isLoop && result.depot) {
      items.push(`
        <li class="route-item depot">
          <span class="route-seq depot">출발</span>
          <span class="route-name" title="${escapeHtml(result.depot.address)}">${escapeHtml(result.depot.address)}</span>
        </li>`);
    }
    result.order.forEach((site, index) => {
      const name = siteDisplayName(site);
      items.push(`
        <li class="route-item">
          <span class="route-seq">${index + 1}</span>
          <span class="route-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        </li>`);
    });
    if (result.isLoop && result.depot) {
      items.push(`
        <li class="route-item depot">
          <span class="route-seq depot">도착</span>
          <span class="route-name" title="${escapeHtml(result.depot.address)}">${escapeHtml(result.depot.address)}</span>
        </li>`);
    }
    els.routeList.innerHTML = items.join("");
  }

  function clearOverlays() {
    overlays.forEach(({ marker, label, leaderOutline, leader, originDot }) => {
      marker.setMap(null);
      label.setMap(null);
      leaderOutline?.setMap(null);
      leader?.setMap(null);
      originDot?.setMap(null);
    });
    overlays.clear();
  }

  function fitBounds() {
    if (!map) return;
    const valid = sites.filter((s) => s.lat != null && s.lng != null);
    if (!valid.length) return;
    if (valid.length === 1) {
      map.setCenter(new naver.maps.LatLng(valid[0].lat, valid[0].lng));
      map.setZoom(18);
      return;
    }
    const bounds = new naver.maps.LatLngBounds();
    valid.forEach((s) => bounds.extend(new naver.maps.LatLng(s.lat, s.lng)));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
  }

  function renderList() {
    els.siteCount.textContent = `${sites.length}곳`;
    renderOverview();
    updateRouteButton();

    if (!sites.length) {
      els.siteList.innerHTML = `<li class="empty">아직 등록된 현장이 없습니다.</li>`;
      return;
    }

    els.siteList.innerHTML = sites
      .map(
        (site, index) => `
        <li class="site-item" data-id="${site.id}">
          <div>
            <strong>${escapeHtml(`${index + 1}. ${siteDisplayName(site)}`)}</strong>
            <span>${escapeHtml(site.address)}</span>
            ${site.note ? `<em class="site-note">${escapeHtml(site.note)}</em>` : ""}
          </div>
          <div class="site-item-actions">
            <button type="button" class="icon-btn" data-action="focus">위치</button>
            <button type="button" class="icon-btn danger" data-action="remove">삭제</button>
          </div>
        </li>`
      )
      .join("");

    els.siteList.querySelectorAll(".site-item").forEach((item) => {
      const id = item.getAttribute("data-id");
      item.querySelector('[data-action="focus"]')?.addEventListener("click", () => {
        const site = sites.find((s) => s.id === id);
        if (!site || site.lat == null || !map) return;
        map.setCenter(new naver.maps.LatLng(site.lat, site.lng));
        map.setZoom(Math.max(map.getZoom(), 18));
      });
      item.querySelector('[data-action="remove"]')?.addEventListener("click", () => {
        removeSite(id);
      });
    });
  }

  function renderOverview() {
    const rowCount = Math.max(sites.length, 1);
    els.overviewGrid.style.setProperty("--site-rows", String(rowCount));
    els.overviewGrid.classList.toggle("compact", sites.length > 40);
    els.overviewGrid.classList.toggle("comfortable", sites.length <= 25);

    const header = `
      <div class="overview-cell overview-head">번호</div>
      <div class="overview-cell overview-head">현장명</div>
      <div class="overview-cell overview-head">주소</div>`;

    if (!sites.length) {
      els.overviewGrid.innerHTML =
        header + `<div class="overview-cell overview-empty">등록된 현장이 없습니다.</div>`;
      return;
    }

    const rows = sites
      .map((site, index) => {
        const number = String(index + 1);
        const name = siteDisplayName(site);
        return `
          <div class="overview-cell" title="${escapeHtml(number)}">${escapeHtml(number)}</div>
          <div class="overview-cell" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          <div class="overview-cell" title="${escapeHtml(site.address)}">${escapeHtml(site.address)}</div>`;
      })
      .join("");

    els.overviewGrid.innerHTML = header + rows;
  }

  /**
   * CSV: 현장명,주소[,비고] (header optional but recommended)
   * @param {string} text
   * @returns {{ name: string, address: string, note?: string }[]}
   */
  function parseCsv(text) {
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lines.length) return [];

    let start = 0;
    let hasNoteColumn = false;
    const firstCols = splitCsvLine(lines[0]).map((c) => c.trim());
    if (
      firstCols.length >= 2 &&
      /현장명|name/i.test(firstCols[0]) &&
      /주소|address/i.test(firstCols[1])
    ) {
      start = 1;
      hasNoteColumn = firstCols.length >= 3 && /비고|note|remark/i.test(firstCols[2]);
    }

    /** @type {{ name: string, address: string, note?: string }[]} */
    const rows = [];
    for (let i = start; i < lines.length; i += 1) {
      const cols = splitCsvLine(lines[i]);
      if (cols.length < 2) continue;
      const name = cols[0].trim();
      let address = "";
      let note = "";
      if (hasNoteColumn) {
        address = cols[1].trim();
        note = cols.slice(2).join(",").trim();
      } else {
        address = cols.slice(1).join(",").trim();
      }
      if (!name || !address) continue;
      rows.push({ name, address, note });
    }
    return rows;
  }

  function splitCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  function loadSites() {
    try {
      const raw = localStorage.getItem(SITES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveSites() {
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));
  }

  /** @returns {LabelMode} */
  function loadLabelMode() {
    const saved = localStorage.getItem(LABEL_MODE_KEY);
    if (saved === "number" || saved === "name" || saved === "all") return saved;
    return "all";
  }

  function setStatus(el, message, type = "") {
    el.textContent = message;
    el.classList.remove("error", "ok");
    if (type) el.classList.add(type);
  }

  let toastTimer = 0;
  function showToast(message) {
    els.toast.hidden = false;
    els.toast.textContent = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
