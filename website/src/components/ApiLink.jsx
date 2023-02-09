import React from 'react';
import Link from '@docusaurus/Link';
// eslint-disable-next-line import/no-extraneous-dependencies
import { useDocsVersion } from '@docusaurus/theme-common/internal';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const ApiLink = ({ to, children }) => {
    const { version, isLast } = useDocsVersion();
    const { siteConfig } = useDocusaurusContext();

    if (siteConfig.presets[0][1].docs.disableVersioning) {
        return (
            <Link to={`/api/${to}`}>{children}</Link>
        );
    }

    let versionSlug = `${version}/`;

    if (version === 'current') {
        versionSlug = 'next/';
    } else if (isLast) {
        versionSlug = '';
    }

    return (
        <Link to={`/api/${versionSlug}${to}`}>{children}</Link>
    );
};

export default ApiLink;
