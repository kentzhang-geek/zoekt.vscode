import { searchZoekt } from './zoekt';
import { ZoektConfig } from './types';

async function test() {
    const config: ZoektConfig = {
        url: 'http://127.0.0.1:6070',
        prefixes: []
    };

    try {
        console.log("--- START SEARCH ---");
        const result = await searchZoekt('test', config); // Simple search
        console.log("--- END SEARCH ---");

        if (result.Result && result.Result.MatchCount !== undefined) {
            console.log(`Success: Found ${result.Result.MatchCount} matches.`);
        } else {
            console.log("Success: No matches (or diff structure), but no crash.");
        }

    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
}

test();
