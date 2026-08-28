"use strict";

/*
=========================================================
 WebBlox Frontend
 Real Roblox experience discovery
 Backend:
 https://webblox-backend.onrender.com
=========================================================
*/

const API_BASE = "https://webblox-backend.onrender.com";

const API = {
    home: `${API_BASE}/api/home`,
    popular: `${API_BASE}/api/popular`,
    search: `${API_BASE}/api/search`,
    game: `${API_BASE}/api/game/`
};


/* =====================================================
   ELEMENTS
===================================================== */

const recommendedContainer =
    document.getElementById("recommendedGames");

const popularContainer =
    document.getElementById("popularGames");

const searchContainer =
    document.getElementById("searchGames");

const searchSection =
    document.getElementById("searchSection");

const searchInput =
    document.getElementById("searchInput");

const searchButton =
    document.getElementById("searchButton");

const searchStatus =
    document.getElementById("searchStatus");

const errorSection =
    document.getElementById("errorSection");

const errorMessage =
    document.getElementById("errorMessage");


/* =====================================================
   API FETCH
===================================================== */

async function apiFetch(url) {

    console.log("[WebBlox] Request:", url);

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json"
        },
        cache: "no-store"
    });

    const text = await response.text();

    console.log(
        "[WebBlox] Status:",
        response.status
    );

    if (text.trim().startsWith("<")) {
        throw new Error(
            "Backend returned HTML instead of JSON."
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            "Backend returned invalid JSON."
        );
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            `Backend returned HTTP ${response.status}`
        );
    }

    if (data.success === false) {
        throw new Error(
            data.error ||
            "Roblox API request failed."
        );
    }

    return data;
}


/* =====================================================
   LOAD HOME
===================================================== */

async function loadHome() {

    hideError();

    showLoading(recommendedContainer);
    showLoading(popularContainer);

    try {

        const data = await apiFetch(API.home);

        console.log(
            "[WebBlox] Home data:",
            data
        );

        const recommended =
            Array.isArray(data.recommended)
                ? data.recommended
                : [];

        const popular =
            Array.isArray(data.popular)
                ? data.popular
                : [];

        renderGames(
            recommendedContainer,
            recommended
        );

        renderGames(
            popularContainer,
            popular
        );

        if (
            recommended.length === 0 &&
            popular.length === 0
        ) {

            showError(
                "The backend connected successfully, but Roblox returned no experiences."
            );
        }

    } catch (error) {

        console.error(
            "[WebBlox] Home error:",
            error
        );

        recommendedContainer.innerHTML = "";
        popularContainer.innerHTML = "";

        showError(error.message);
    }
}


/* =====================================================
   RENDER GAMES
===================================================== */

function renderGames(container, games) {

    if (!container) return;

    container.innerHTML = "";

    if (!Array.isArray(games) || games.length === 0) {

        container.innerHTML = `
            <div class="empty-card">
                No Roblox experiences found.
            </div>
        `;

        return;
    }

    games.forEach(game => {

        if (!game) return;

        container.appendChild(
            createGameCard(game)
        );
    });
}


/* =====================================================
   CREATE GAME CARD
===================================================== */

function createGameCard(game) {

    const card =
        document.createElement("article");

    card.className =
        "game-card";


    /* IMAGE */

    const image =
        document.createElement("img");

    image.className =
        "game-thumbnail";

    image.loading =
        "lazy";

    image.src =
        game.thumbnail ||
        game.icon ||
        createPlaceholder(
            game.name
        );

    image.alt =
        game.name ||
        "Roblox experience";

    image.onerror = function () {

        if (this.dataset.failed) {
            return;
        }

        this.dataset.failed = "true";

        this.src =
            createPlaceholder(
                game.name
            );
    };


    /* BODY */

    const body =
        document.createElement("div");

    body.className =
        "game-card-body";


    /* TITLE */

    const title =
        document.createElement("h3");

    title.textContent =
        game.name ||
        "Unknown Experience";


    /* CREATOR */

    const creator =
        document.createElement("p");

    creator.className =
        "game-creator";

    creator.textContent =
        "By " +
        (
            game.creator ||
            "Roblox Creator"
        );


    /* STATS */

    const stats =
        document.createElement("div");

    stats.className =
        "game-stats";


    const players =
        document.createElement("span");

    players.textContent =
        "● " +
        formatNumber(
            game.playing ||
            game.playerCount ||
            game.players ||
            0
        ) +
        " playing";


    const visits =
        document.createElement("span");

    visits.textContent =
        formatNumber(
            game.visits ||
            game.visitCount ||
            0
        ) +
        " visits";


    stats.appendChild(players);
    stats.appendChild(visits);


    body.appendChild(title);
    body.appendChild(creator);
    body.appendChild(stats);

    card.appendChild(image);
    card.appendChild(body);


    /* CLICK */

    card.addEventListener(
        "click",
        () => openGame(game)
    );

    return card;
}


/* =====================================================
   SEARCH
===================================================== */

async function searchGames() {

    const query =
        searchInput.value.trim();

    if (!query) {

        clearSearch();

        return;
    }

    searchSection.classList.remove(
        "hidden"
    );

    searchContainer.innerHTML = `
        <div class="loading-card">
            <div class="spinner"></div>
            <span>Searching Roblox...</span>
        </div>
    `;

    searchStatus.textContent =
        `Searching Roblox for "${query}"...`;

    try {

        const url =
            API.search +
            "?q=" +
            encodeURIComponent(query);

        const data =
            await apiFetch(url);

        console.log(
            "[WebBlox] Search data:",
            data
        );

        const games =
            Array.isArray(data.games)
                ? data.games
                : [];

        searchStatus.textContent =
            `${games.length} Roblox experience${
                games.length === 1
                    ? ""
                    : "s"
            } found`;

        renderGames(
            searchContainer,
            games
        );

        searchSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    } catch (error) {

        console.error(
            "[WebBlox] Search error:",
            error
        );

        searchStatus.textContent =
            "Search failed";

        searchContainer.innerHTML = `
            <div class="empty-card">
                ${escapeHTML(error.message)}
            </div>
        `;
    }
}


/* =====================================================
   OPEN GAME
===================================================== */

function openGame(game) {

    const modal =
        document.getElementById(
            "gameModal"
        );

    if (!modal) return;


    document.getElementById(
        "modalTitle"
    ).textContent =
        game.name ||
        "Roblox Experience";


    document.getElementById(
        "modalCreator"
    ).textContent =
        "By " +
        (
            game.creator ||
            "Roblox Creator"
        );


    document.getElementById(
        "modalDescription"
    ).textContent =
        game.description ||
        "No description available.";


    document.getElementById(
        "modalPlayers"
    ).textContent =
        formatNumber(
            game.playing ||
            game.playerCount ||
            0
        );


    document.getElementById(
        "modalVisits"
    ).textContent =
        formatNumber(
            game.visits ||
            game.visitCount ||
            0
        );


    const image =
        document.getElementById(
            "modalImage"
        );

    image.src =
        game.thumbnail ||
        game.icon ||
        createPlaceholder(
            game.name
        );


    const playButton =
        document.getElementById(
            "playButton"
        );


    playButton.onclick = function () {

        const placeId =
            game.placeId ||
            game.placeID ||
            game.rootPlaceId;

        if (!placeId) {

            alert(
                "This Roblox experience does not have a place ID."
            );

            return;
        }

        window.open(
            `https://www.roblox.com/games/${encodeURIComponent(placeId)}`,
            "_blank",
            "noopener,noreferrer"
        );
    };


    modal.classList.remove(
        "hidden"
    );

    document.body.classList.add(
        "modal-open"
    );
}


/* =====================================================
   CLOSE GAME
===================================================== */

function closeGame() {

    const modal =
        document.getElementById(
            "gameModal"
        );

    if (modal) {

        modal.classList.add(
            "hidden"
        );
    }

    document.body.classList.remove(
        "modal-open"
    );
}


/* =====================================================
   SEARCH EVENTS
===================================================== */

if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchGames
    );
}


if (searchInput) {

    searchInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {

                searchGames();
            }
        }
    );
}


/* =====================================================
   CLEAR SEARCH
===================================================== */

function clearSearch() {

    if (searchInput) {
        searchInput.value = "";
    }

    if (searchSection) {

        searchSection.classList.add(
            "hidden"
        );
    }

    if (searchContainer) {

        searchContainer.innerHTML = "";
    }

    if (searchStatus) {

        searchStatus.textContent = "";
    }
}


/* =====================================================
   ERROR
===================================================== */

function showError(message) {

    if (!errorMessage ||
        !errorSection) {
        return;
    }

    errorMessage.textContent =
        message ||
        "The Roblox game service could not be reached.";

    errorSection.classList.remove(
        "hidden"
    );
}


function hideError() {

    if (!errorSection) return;

    errorSection.classList.add(
        "hidden"
    );
}


/* =====================================================
   LOADING
===================================================== */

function showLoading(container) {

    if (!container) return;

    container.innerHTML = `
        <div class="loading-card">
            <div class="spinner"></div>
            <span>Loading Roblox games...</span>
        </div>
    `;
}


/* =====================================================
   NUMBER FORMAT
===================================================== */

function formatNumber(number) {

    number =
        Number(number) || 0;

    if (number >= 1000000000) {

        return (
            number / 1000000000
        ).toFixed(1) + "B";
    }

    if (number >= 1000000) {

        return (
            number / 1000000
        ).toFixed(1) + "M";
    }

    if (number >= 1000) {

        return (
            number / 1000
        ).toFixed(1) + "K";
    }

    return number.toLocaleString();
}


/* =====================================================
   PLACEHOLDER
===================================================== */

function createPlaceholder(name) {

    const text =
        String(
            name || "Roblox"
        ).substring(0, 25);

    const svg = `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="768"
            height="432"
            viewBox="0 0 768 432"
        >
            <rect
                width="768"
                height="432"
                fill="#18191c"
            />

            <text
                x="384"
                y="216"
                text-anchor="middle"
                dominant-baseline="middle"
                fill="#ffffff"
                font-size="32"
                font-family="Arial"
            >
                ${escapeHTML(text)}
            </text>
        </svg>
    `;

    return (
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(svg)
    );
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =====================================================
   SCROLL
===================================================== */

function scrollToGames() {

    const section =
        document.querySelector(
            ".game-section"
        );

    if (!section) return;

    section.scrollIntoView({
        behavior: "smooth"
    });
}


function scrollToPopular() {

    const section =
        document.getElementById(
            "popularSection"
        );

    if (!section) return;

    section.scrollIntoView({
        behavior: "smooth"
    });
}


/* =====================================================
   ESC KEY
===================================================== */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closeGame();
        }
    }
);


/* =====================================================
   START
===================================================== */

console.log(
    "[WebBlox] Frontend starting..."
);

console.log(
    "[WebBlox] Backend:",
    API_BASE
);

console.log(
    "[WebBlox] API:",
    API
);

loadHome();
