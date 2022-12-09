import DefaultNavbarItem from '@theme/NavbarItem/DefaultNavbarItem';
import DropdownNavbarItem from '@theme/NavbarItem/DropdownNavbarItem';
import LocaleDropdownNavbarItem from '@theme/NavbarItem/LocaleDropdownNavbarItem';
import SearchNavbarItem from '@theme/NavbarItem/SearchNavbarItem';
import HtmlNavbarItem from '@theme/NavbarItem/HtmlNavbarItem';
import DocSidebarNavbarItem from '@theme/NavbarItem/DocSidebarNavbarItem';
import DocsVersionNavbarItem from '@theme/NavbarItem/DocsVersionNavbarItem';
import DocsVersionDropdownNavbarItem from '@theme/NavbarItem/DocsVersionDropdownNavbarItem';
import { useDocsVersion, useLayoutDoc } from '@docusaurus/theme-common/internal';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import React from 'react';

const versions = require('../../../versions.json');

const stable = versions[0];

function DocNavbarItem({
    docId,
    label: staticLabel,
    docsPluginId,
    ...props
}) {
    const doc = useLayoutDoc(docId, docsPluginId);
    // Draft items are not displayed in the navbar.
    if (doc === null) {
        return null;
    }
    return (
        <DefaultNavbarItem
            exact
            {...props}
            label={staticLabel ?? doc.id}
            to={doc.path}
        />
    );
}

function ApiNavbarItem(ctx) {
    let version = {};

    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        version = useDocsVersion();
    } catch {
        version.version = stable;
    }

    const { siteConfig } = useDocusaurusContext();

    if (siteConfig.presets[0][1].docs.disableVersioning || version.version === stable) {
        return (
            <DefaultNavbarItem
                exact
                {...ctx}
                label={ctx.label}
                to={`api/${ctx.to}`}
            />
        );
    }

    // skip changelog button for older versions
    if (+version.version < 3 && ctx.className === 'changelog') {
        return null;
    }

    return (
        <DefaultNavbarItem
            exact
            {...ctx}
            label={ctx.label}
            to={`api/${version.version === 'current' ? 'next' : version.version}/${ctx.to}`}
        />
    );
}

const ComponentTypes = {
    'default': DefaultNavbarItem,
    'localeDropdown': LocaleDropdownNavbarItem,
    'search': SearchNavbarItem,
    'dropdown': DropdownNavbarItem,
    'html': HtmlNavbarItem,
    'custom-api': ApiNavbarItem,
    'doc': DocNavbarItem,
    'docSidebar': DocSidebarNavbarItem,
    'docsVersion': DocsVersionNavbarItem,
    'docsVersionDropdown': DocsVersionDropdownNavbarItem,
};
export default ComponentTypes;
