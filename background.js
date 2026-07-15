const YOUTUBE_MUSIC_URL = "https://music.youtube.com/*";

async function getYouTubeMusicTabs() {
    return browser.tabs.query({
        url: YOUTUBE_MUSIC_URL
    });
}

async function getTabPlayerState(tab) {
    try {
        const state = await browser.tabs.sendMessage(
            tab.id,
            {
                type: "GET_STATE"
            }
        );

        return {
            tab,
            state,
            reachable: true
        };
    } catch (error) {
        console.warn(
            `Music Deck could not inspect tab ${tab.id}:`,
            error
        );

        return {
            tab,
            state: null,
            reachable: false
        };
    }
}

function hasLoadedTrack(state) {
    return Boolean(
        state?.title?.trim() ||
        state?.artist?.trim() ||
        state?.artwork
    );
}

function sortByRecentAccess(tabStates) {
    return [...tabStates].sort((a, b) => {
        return (
            (b.tab.lastAccessed ?? 0) -
            (a.tab.lastAccessed ?? 0)
        );
    });
}

async function findBestMusicTab() {
    const tabs = await getYouTubeMusicTabs();

    if (tabs.length === 0) {
        return {
            tabState: null,
            error: "YOUTUBE_MUSIC_NOT_FOUND"
        };
    }

    const inspectedTabs = await Promise.all(
        tabs.map(getTabPlayerState)
    );

    const reachableTabs = inspectedTabs.filter(
        (tabState) => tabState.reachable
    );

    if (reachableTabs.length === 0) {
        return {
            tabState: null,
            error: "CONTENT_SCRIPT_UNAVAILABLE"
        };
    }

    const playingTabs = sortByRecentAccess(
        reachableTabs.filter(
            ({ state }) => state?.isPlaying === true
        )
    );

    if (playingTabs.length > 0) {
        return {
            tabState: playingTabs[0],
            error: null
        };
    }

    const loadedTrackTabs = sortByRecentAccess(
        reachableTabs.filter(
            ({ state }) => hasLoadedTrack(state)
        )
    );

    if (loadedTrackTabs.length > 0) {
        return {
            tabState: loadedTrackTabs[0],
            error: null
        };
    }

    const activeTabs = sortByRecentAccess(
        reachableTabs.filter(
            ({ tab }) => tab.active
        )
    );

    if (activeTabs.length > 0) {
        return {
            tabState: activeTabs[0],
            error: null
        };
    }

    const recentTabs = sortByRecentAccess(
        reachableTabs
    );

    return {
        tabState: recentTabs[0],
        error: null
    };
}

browser.runtime.onMessage.addListener(async (message) => {
    if (message.type !== "MUSIC_DECK_REQUEST") {
        return;
    }

    const {
        tabState,
        error
    } = await findBestMusicTab();

    if (!tabState) {
        return {
            ok: false,
            error
        };
    }

    try {
        let response;

        if (message.payload?.type === "GET_STATE") {
            response = tabState.state;
        } else {
            response = await browser.tabs.sendMessage(
                tabState.tab.id,
                message.payload
            );
        }

        return {
            ok: true,
            data: response
        };
    } catch (sendError) {
        console.error(
            "Music Deck content-script error:",
            sendError
        );

        return {
            ok: false,
            error: "CONTENT_SCRIPT_UNAVAILABLE"
        };
    }
});