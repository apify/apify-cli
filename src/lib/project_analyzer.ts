import { PROJECT_TYPES } from './consts.js';
import { CrawleeAnalyzer } from './projects/CrawleeAnalyzer.js';
import { OldApifySDKAnalyzer } from './projects/OldApifySDKAnalyzer.js';
import { ScrapyProjectAnalyzer } from './projects/scrapy/ScrapyProjectAnalyzer.js';

interface ProjectAnalyzerType {
    type: typeof PROJECT_TYPES[keyof typeof PROJECT_TYPES];
    // At minimum, this is what an analyzer should have.
    analyzer: {
        isApplicable(pathname: string): boolean;
    };
}

const analyzers: ProjectAnalyzerType[] = [
    {
        type: PROJECT_TYPES.SCRAPY,
        analyzer: ScrapyProjectAnalyzer,
    },
    {
        type: PROJECT_TYPES.CRAWLEE,
        analyzer: CrawleeAnalyzer,
    },
    {
        type: PROJECT_TYPES.PRE_CRAWLEE_APIFY_SDK,
        analyzer: OldApifySDKAnalyzer,
    },
];

export class ProjectAnalyzer {
    static getProjectType(pathname: string) {
        const analyzer = analyzers.find((a) => {
            if (!a.analyzer.isApplicable) {
                throw new Error(`Analyzer ${a.analyzer} does not have isApplicable method.`);
            }

            return a.analyzer.isApplicable(pathname);
        });

        return analyzer?.type || PROJECT_TYPES.UNKNOWN;
    }
}
