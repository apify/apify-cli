import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { PageMetadata } from '@docusaurus/theme-common';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

export default function NotFound() {
    const redirectedV2Url = useBaseUrl('/docs/api');
    const redirectedV1Url = useBaseUrl('/docs/1.3.1/api');
    const baseUrlForV2Redirect = useBaseUrl(`/docs/2.3/api/`);
    const baseUrlForV1Redirect = useBaseUrl(`/docs/1.3/api/`);
    const isBrowser = useIsBrowser();

    if (isBrowser) {
        const path = window.location.pathname;
        let href = '';
        let redirect = false;

        if (path.startsWith(redirectedV2Url)) {
            href = baseUrlForV2Redirect + path.substring(redirectedV2Url.length + 1);
            redirect = true;
        }

        if (path.match(/\/docs\/2\.\d+\.\d+\/api/)) {
            href = baseUrlForV2Redirect + path.substring(redirectedV1Url.length + 1);
            redirect = true;
        }

        if (path.match(/\/api\/[12]\.\d+\/\w+/)) {
            const [, v, id] = path.match(/\/api\/([12])\.\d+\/(.*)/);
            href = (v === '1' ? baseUrlForV1Redirect : baseUrlForV2Redirect) + id;
            redirect = true;
        }

        if (path.match(/\/docs\/[01]\.\d+\.\d+\/api\/(.*)/)) {
            const id = path.match(/\/docs\/[01]\.\d+\.\d+\/api\/(.*)/)[1];
            href = baseUrlForV1Redirect + id;
            redirect = true;
        }

        if (redirect && window.location.href !== href) {
            window.location.href = href;
        }
    }

    return (
        <>
            <PageMetadata title={'Page Not Found'} />
            <Layout>
                <main className="container margin-vert--xl">
                    <div className="row">
                        <div className="col col--6 col--offset-3">
                            <h1 className="hero__title">
                                Page Not Found
                            </h1>
                            <p>
                                We could not find what you were looking for 😢
                            </p>
                            <p>
                                Recently we <b>released Apify SDK v3 </b>
                                and we significantly upgraded the documentation.
                            </p>
                            <p>
                                If you're looking for documentation of <b>Apify SDK v2</b>,
                                <Link to={'/docs/2.3/guides/apify-platform'}> you can find it here</Link>.
                            </p>
                            <p>
                                For <b>Apify SDK v3 docs</b>, go to the <Link to={'/'}>homepage</Link>.
                            </p>
                        </div>
                    </div>
                </main>
            </Layout>
        </>
    );
}
