"use strict";

/* ============================================================
   WebBlox Frontend
   ============================================================ */

const API_BASE =
    "https://webblox-backend.onrender.com";

const API = {
    home:
        API_BASE + "/api/home",

    popular:
        API_BASE + "/api/popular",

    search:
        API_BASE + "/api/search",

    game:
        API_BASE + "/api/game/"
};


/* ============================================================
   ELEMENTS
   ============================================================ */

const recommendedContainer =
    document.getElementById(
        "recommendedGames"
    );

const popularContainer =
    document.getElementById(
        "popularGames"
    );

const searchContainer =
    document.getElementById(
        "searchGames"
    );

const searchSection =
    document.getElementById(
        "searchSection"
    );

const searchInput =
    document.getElementById(
        "searchInput"
    );

const searchButton =
    document.getElementById(
        "searchButton"
    );

const searchStatus =
    document.getElementById(
        "searchStatus"
    );

const errorSection =
    document.getElementById(
        "errorSection"
    );

const errorMessage =
    document.getElementById(
        "errorMessage"
    );


/* ============================================================
   API
   ============================================================ */

async function apiFetch(url) {

    console.log(
        "[WebBlox] Request:",
        url
    );

    const response =
        await fetch(url, {
            method: "GET",
            headers: {
                Accept:
                    "application/json"
            },
            cache: "no-store"
        });

    const text =
        await response.text();

    if (!text) {
        throw new Error(
            "The WebBlox backend returned an empty response."
        );
    }

    let data;

    try {
        data =
            JSON.parse(text);
    } catch {
        throw new Error(
            "The backend returned invalid JSON."
        );
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            `Backend HTTP ${response.status}`
        );
    }

    if (
        data.success === false
    ) {
        throw new Error(
            data.error ||
            "WebBlox returned an error."
        );
    }

    return data;
}


/* ============================================================
   HOME
   ============================================================ */

async function loadHome() {

    hideError();

    showLoading(
        recommendedContainer,
        "Loading Roblox experiences..."
    );

    showLoading(
        popularContainer,
        "Loading Roblox experiences..."
    );

    try {

        const data =
            await apiFetch(
                API.home
            );

        const recommended =
            Array.isArray(
                data.recommended
            )
                ? data.recommended
                : [];

        const popular =
            Array.isArray(
                data.popular
            )
                ? data.popular
                : [];

        renderGames(
            recommendedContainer,
            recommended,
            "No recommended experiences found."
        );

        renderGames(
            popularContainer,
            popular,
            "No popular experiences found."
        );

        if (
            recommended.length === 0 &&
            popular.length === 0
        ) {
            showError(
                "Roblox returned no experiences."
            );
        }

    } catch (error) {

        console.error(
            "[WebBlox] Home error:",
            error
        );

        recommendedContainer.innerHTML =
            "";

        popularContainer.innerHTML =
            "";

        showError(
            error.message
        );
    }
}


/* ============================================================
   RENDER
   ============================================================ */

function renderGames(
    container,
    games,
    emptyMessage
) {

    container.innerHTML =
        "";

    if (
        !Array.isArray(games) ||
        games.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-card">
                ${escapeHTML(
                    emptyMessage
                )}
            </div>
        `;

        return;
    }

    for (
        const game of games
    ) {

        if (
            !game ||
            !game.name ||
            !game.placeId
        ) {
            continue;
        }

        container.appendChild(
            createGameCard(game)
        );
    }

    if (
        container.children.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-card">
                No valid Roblox experiences found.
            </div>
        `;
    }
}


/* ============================================================
   GAME CARD
   ============================================================ */

function createGameCard(game) {

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "game-card";

    /*
     * IMAGE AREA
     */

    const imageWrap =
        document.createElement(
            "div"
        );

    imageWrap.className =
        "game-image-wrap";

    const image =
        document.createElement(
            "img"
        );

    image.className =
        "game-image";

    image.alt =
        game.name;

    image.loading =
        "lazy";

    image.decoding =
        "async";

    const imageUrl =
        game.thumbnail ||
        game.icon;

    if (imageUrl) {

        image.src =
            imageUrl;

    } else {

        imageWrap.classList.add(
            "image-failed"
        );
    }

    image.addEventListener(
        "error",
        () => {

            image.style.display =
                "none";

            imageWrap.classList.add(
                "image-failed"
            );

        }
    );

    imageWrap.appendChild(
        image
    );


    /*
     * BODY
     */

    const body =
        document.createElement(
            "div"
        );

    body.className =
        "game-card-body";


    /*
     * TITLE
     */

    const title =
        document.createElement(
            "h3"
        );

    title.className =
        "game-title";

    title.textContent =
        game.name;


    /*
     * CREATOR
     */

    const creator =
        document.createElement(
            "p"
        );

    creator.className =
        "game-creator";

    creator.textContent =
        "By " +
        (
            game.creator ||
            "Roblox Creator"
        );


    /*
     * STATS
     */

    const stats =
        document.createElement(
            "div"
        );

    stats.className =
        "game-stats";

    const players =
        document.createElement(
            "span"
        );

    players.textContent =
        "● " +
        formatNumber(
            game.playing
        ) +
        " playing";

    const visits =
        document.createElement(
            "span"
        );

    visits.textContent =
        formatNumber(
            game.visits
        ) +
        " visits";

    stats.appendChild(
        players
    );

    stats.appendChild(
        visits
    );


    body.appendChild(
        title
    );

    body.appendChild(
        creator
    );

    body.appendChild(
        stats
    );


    card.appendChild(
        imageWrap
    );

    card.appendChild(
        body
    );


    /*
     * OPEN
     */

    card.addEventListener(
        "click",
        () => {
            openGame(game);
        }
    );

    return card;
}


/* ============================================================
   SEARCH
   ============================================================ */

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

    searchStatus.textContent =
        `Searching Roblox for "${query}"...`;

    showLoading(
        searchContainer,
        "Searching Roblox..."
    );

    try {

        const url =
            API.search +
            "?q=" +
            encodeURIComponent(
                query
            );

        const data =
            await apiFetch(url);

        const games =
            Array.isArray(
                data.games
            )
                ? data.games
                : [];

        searchStatus.textContent =
            games.length === 1
                ? "1 experience found"
                : `${games.length} experiences found`;

        renderGames(
            searchContainer,
            games,
            "No Roblox experiences matched your search."
        );

        searchSection.scrollIntoView({
            behavior:
                "smooth",
            block:
                "start"
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
                ${escapeHTML(
                    error.message
                )}
            </div>
        `;
    }
}


/* ============================================================
   GAME MODAL
   ============================================================ */

function openGame(game) {

    const modal =
        document.getElementById(
            "gameModal"
        );

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
            game.playing
        );

    document.getElementById(
        "modalVisits"
    ).textContent =
        formatNumber(
            game.visits
        );

    const modalImage =
        document.getElementById(
            "modalImage"
        );

    modalImage.src =
        game.thumbnail ||
        game.icon ||
        "";

    modalImage.alt =
        game.name ||
        "Roblox experience";

    modalImage.onerror =
        () => {
            modalImage.style.display =
                "none";
        };


    const playButton =
        document.getElementById(
            "playButton"
        );

    playButton.onclick =
        () => {

            if (!game.placeId) {
                return;
            }

            /*
             * Open the REAL Roblox experience.
             */

            window.open(
                `https://www.roblox.com/games/${encodeURIComponent(
                    game.placeId
                )}`,
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


/* ============================================================
   CLOSE
   ============================================================ */

function closeGame() {

    const modal =
        document.getElementById(
            "gameModal"
        );

    modal.classList.add(
        "hidden"
    );

    document.body.classList.remove(
        "modal-open"
    );
}


/* ============================================================
   CLEAR
   ============================================================ */

function clearSearch() {

    searchInput.value =
        "";

    searchSection.classList.add(
        "hidden"
    );

    searchContainer.innerHTML =
        "";

    searchStatus.textContent =
        "";
}


/* ============================================================
   ERROR
   ============================================================ */

function showError(message) {

    errorMessage.textContent =
        message ||
        "Roblox could not be reached.";

    errorSection.classList.remove(
        "hidden"
    );
}

function hideError() {

    errorSection.classList.add(
        "hidden"
    );
}


/* ============================================================
   LOADING
   ============================================================ */

function showLoading(
    container,
    message
) {

    container.innerHTML = `
        <div class="loading-card">
            <div class="spinner"></div>
            <span>
                ${escapeHTML(
                    message
                )}
            </span>
        </div>
    `;
}


/* ============================================================
   NUMBER FORMAT
   ============================================================ */

function formatNumber(value) {

    const number =
        Number(value) || 0;

    if (
        number >= 1_000_000_000
    ) {
        return (
            number /
            1_000_000_000
        ).toFixed(1) + "B";
    }

    if (
        number >= 1_000_000
    ) {
        return (
            number /
            1_000_000
        ).toFixed(1) + "M";
    }

    if (
        number >= 1_000
    ) {
        return (
            number /
            1_000
        ).toFixed(1) + "K";
    }

    return number.toLocaleString();
}


/* ============================================================
   ESCAPE
   ============================================================ */

function escapeHTML(value) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* ============================================================
   SCROLL
   ============================================================ */

function scrollToGames() {

    const section =
        document.querySelector(
            ".game-section"
        );

    if (section) {
        section.scrollIntoView({
            behavior:
                "smooth"
        });
    }
}

function scrollToPopular() {

    const section =
        document.getElementById(
            "popularSection"
        );

    if (section) {
        section.scrollIntoView({
            behavior:
                "smooth"
        });
    }
}


/* ============================================================
   EVENTS
   ============================================================ */

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
                event.key ===
                "Enter"
            ) {
                searchGames();
            }

        }
    );
}

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {
            closeGame();
        }

    }
);


/* ============================================================
   START
   ============================================================ */

console.log(
    "[WebBlox] Frontend:",
    window.location.href
);

console.log(
    "[WebBlox] Backend:",
    API_BASE
);

loadHome();
