# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1](https://github.com/apify/apify-cli/releases/tag/v1.1.1) (2025-08-18)

### 🐛 Bug Fixes

- Unknown errors from tracking ([#895](https://github.com/apify/apify-cli/pull/895)) ([3485f36](https://github.com/apify/apify-cli/commit/3485f366f3a62117ac833e78157c230206c3c60e)) by [@vladfrangu](https://github.com/vladfrangu), closes [#894](https://github.com/apify/apify-cli/issues/894)
- Upgrade command should always check when manually ran ([#897](https://github.com/apify/apify-cli/pull/897)) ([5e0ea9f](https://github.com/apify/apify-cli/commit/5e0ea9ff84012732ca7117d1f68207b5170ffeed)) by [@vladfrangu](https://github.com/vladfrangu)

## [1.1.0](https://github.com/apify/apify-cli/releases/tag/v1.1.0) (2025-08-13)

### 🚀 Features

- Upgrade command, install shell script ([#810](https://github.com/apify/apify-cli/pull/810)) ([51ef00a](https://github.com/apify/apify-cli/commit/51ef00ad32a6835c48781b99c6233113cf58d8a4)) by [@vladfrangu](https://github.com/vladfrangu)
- [**breaking**] Make storage purging default, add `--resurrect` ([#729](https://github.com/apify/apify-cli/pull/729)) ([8dff93a](https://github.com/apify/apify-cli/commit/8dff93a2d769997a96d4a7750fb36c2770b9a61c)) by [@vladfrangu](https://github.com/vladfrangu), closes [#590](https://github.com/apify/apify-cli/issues/590)
- Handle sub-schema validation ([#853](https://github.com/apify/apify-cli/pull/853)) ([5fc2a2f](https://github.com/apify/apify-cli/commit/5fc2a2f6b780a86a250b69375455f3bb2e9a8983)) by [@MFori](https://github.com/MFori)
- Upgrade command upgrading CLI + install command ([#856](https://github.com/apify/apify-cli/pull/856)) ([4252e6c](https://github.com/apify/apify-cli/commit/4252e6cb681deb5f92c654520d0ed03b70e426c3)) by [@vladfrangu](https://github.com/vladfrangu)
- Add signature to KV store URLs where required ([#875](https://github.com/apify/apify-cli/pull/875)) ([a1e9982](https://github.com/apify/apify-cli/commit/a1e998270b5c05cd91280efa144325e2d7a7de0e)) by [@danpoletaev](https://github.com/danpoletaev)

### 🐛 Bug Fixes

- Pretty message for invalid choices ([#805](https://github.com/apify/apify-cli/pull/805)) ([57bd5de](https://github.com/apify/apify-cli/commit/57bd5de9bc5289f151a9083533dc3d2c71f8b9ab)) by [@vladfrangu](https://github.com/vladfrangu)
- Shebangs ([#806](https://github.com/apify/apify-cli/pull/806)) ([1cdc101](https://github.com/apify/apify-cli/commit/1cdc1011f36974708ab91a25d4d6c6a5dc43d989)) by [@vladfrangu](https://github.com/vladfrangu)
- Recognize sh files as text files ([#813](https://github.com/apify/apify-cli/pull/813)) ([ef3e9b0](https://github.com/apify/apify-cli/commit/ef3e9b064483c04cd7bef2143a19e1a6992ddcff)) by [@DaveHanns](https://github.com/DaveHanns)
- **init:** Prompt for a name if an old config does not exist ([#836](https://github.com/apify/apify-cli/pull/836)) ([26fcd66](https://github.com/apify/apify-cli/commit/26fcd660a0f7b4adb4e1a3329705a8ff6d8f43b2)) by [@vladfrangu](https://github.com/vladfrangu), closes [#835](https://github.com/apify/apify-cli/issues/835)
- Pass apify client down to output job log wherever possible ([#839](https://github.com/apify/apify-cli/pull/839)) ([5cdb06c](https://github.com/apify/apify-cli/commit/5cdb06c0e24c2501b2034dbb7339798985b269cc)) by [@vladfrangu](https://github.com/vladfrangu)
- **pull:** Handle private actors correctly ([#865](https://github.com/apify/apify-cli/pull/865)) ([efd7308](https://github.com/apify/apify-cli/commit/efd730855f99a36091ce51d501e5755b5ad79ffb)) by [@vladfrangu](https://github.com/vladfrangu), closes [#855](https://github.com/apify/apify-cli/issues/855)

### Chore

- [**breaking**] Move from yargs to node:util ([#871](https://github.com/apify/apify-cli/pull/871)) ([482d0b2](https://github.com/apify/apify-cli/commit/482d0b29f285c020320f1f2e3f0fd08a362d57cc)) by [@vladfrangu](https://github.com/vladfrangu), closes [#833](https://github.com/apify/apify-cli/issues/833)
- [**breaking**] Make opening the actor build results in push opt-in ([#881](https://github.com/apify/apify-cli/pull/881)) ([d842424](https://github.com/apify/apify-cli/commit/d84242421387a9487eef5c07183dd0b8ac7ae67b)) by [@vladfrangu](https://github.com/vladfrangu)

## [0.21.9](https://github.com/apify/apify-cli/releases/tag/v0.21.9) (2025-07-17)

### 🚀 Features

- Handle sub-schema validation (#853) ([51cc733](https://github.com/apify/apify-cli/commit/51cc7333ca665a6e0dfab8a6dc296a396b3e40ff))

## [0.21.8](https://github.com/apify/apify-cli/releases/tag/v0.21.8) (2025-06-24)

### 🐛 Bug Fixes

- Recognize sh files as text files (#813) ([9c514be](https://github.com/apify/apify-cli/commit/9c514bef27cded91d0d737077e01d8ddb471effb))
- **init:** Prompt for a name if an old config does not exist (#836) ([4817c1c](https://github.com/apify/apify-cli/commit/4817c1c95ee6ca5d3078add283dd7c54c1444b48))
- Pass apify client down to output job log wherever possible (#839) ([96ba05f](https://github.com/apify/apify-cli/commit/96ba05fdacf30131ef9173e24359bc98e805f1b1))

## [0.21.7](https://github.com/apify/apify-cli/releases/tag/v0.21.7) (2025-05-15)

### 🐛 Bug Fixes

- Pick the start script for node projects before main property ([#787](https://github.com/apify/apify-cli/pull/787)) ([0e2a9d3](https://github.com/apify/apify-cli/commit/0e2a9d375f3b977b6f1a588fe5bbce5527b7505b)) by [@vladfrangu](https://github.com/vladfrangu)
- Non-&quot;migrated&quot; scrapy not working anymore ([#800](https://github.com/apify/apify-cli/pull/800)) ([9eaf76c](https://github.com/apify/apify-cli/commit/9eaf76cfe455c08b93511e985419182a6549d37e)) by [@vladfrangu](https://github.com/vladfrangu), closes [#796](https://github.com/apify/apify-cli/issues/796)

## [0.21.6](https://github.com/apify/apify-cli/releases/tag/v0.21.6) (2025-04-24)

### 🐛 Bug Fixes

- Windows and python compatibility ([#786](https://github.com/apify/apify-cli/pull/786)) ([eeca37d](https://github.com/apify/apify-cli/commit/eeca37df62461a0ca1fa6f2f72386b18eb65a077)) by [@vladfrangu](https://github.com/vladfrangu)

## [0.21.5](https://github.com/apify/apify-cli/releases/tag/v0.21.5) (2025-04-23)

### 🐛 Bug Fixes

- Runtime detection on Windows ([#785](https://github.com/apify/apify-cli/pull/785)) ([579d303](https://github.com/apify/apify-cli/commit/579d3036ac5062420abe6c17f478a24ca5da9e93)) by [@vladfrangu](https://github.com/vladfrangu)

## [0.21.4](https://github.com/apify/apify-cli/releases/tag/v0.21.4) (2025-04-22)

### 🐛 Bug Fixes

- Python project detection and project detection ([#774](https://github.com/apify/apify-cli/pull/774)) ([09a42e4](https://github.com/apify/apify-cli/commit/09a42e48b26793578ce845639f7ca921a94d41ff)) by [@vladfrangu](https://github.com/vladfrangu)

## [0.21.3](https://github.com/apify/apify-cli/releases/tag/v0.21.3) (2025-03-31)

### 🚀 Features

- Add signature to actor get-public-url ([#767](https://github.com/apify/apify-cli/pull/767)) ([4641053](https://github.com/apify/apify-cli/commit/464105310d52bb78dbf979cc6d7d31c3ee30003d)) by [@danpoletaev](https://github.com/danpoletaev)

## [0.21.2](https://github.com/apify/apify-cli/releases/tag/v0.21.2) (2025-02-26)

### 🚀 Features

- Actor charge command ([#748](https://github.com/apify/apify-cli/pull/748)) ([766c647](https://github.com/apify/apify-cli/commit/766c6470fe8c84fa1be663ee3251b48830f3cc27)) by [@mhamas](https://github.com/mhamas)
- Add get-public-url command ([#756](https://github.com/apify/apify-cli/pull/756)) ([88aadee](https://github.com/apify/apify-cli/commit/88aadee4621438b5df180a27f0ffc2a6b6bee946)) by [@janbuchar](https://github.com/janbuchar)

### 🐛 Bug Fixes

- `actor set-value` with stdin input ([#755](https://github.com/apify/apify-cli/pull/755)) ([14bf6c5](https://github.com/apify/apify-cli/commit/14bf6c50a9e576700a60e1620a73b2e07c9b801e)) by [@vladfrangu](https://github.com/vladfrangu)

## [0.21.1](https://github.com/apify/apify-cli/releases/tag/v0.21.1) (2025-02-05)

### 🐛 Bug Fixes

- Emit logs to stderr when actors are started with `--json` flag ([#741](https://github.com/apify/apify-cli/pull/741)) ([a50b80e](https://github.com/apify/apify-cli/commit/a50b80e1e8f636b6878de8f8c30032c14daf8105)) by [@vladfrangu](https://github.com/vladfrangu), closes [#740](https://github.com/apify/apify-cli/issues/740)

## [0.21.0](https://github.com/apify/apify-cli/releases/tag/v0.21.0) (2025-01-16)

### 🚀 Features

- Builds namespace ([#620](https://github.com/apify/apify-cli/pull/620)) ([6345162](https://github.com/apify/apify-cli/commit/6345162e44a00b404b4f95c2c80c2e437eff1d62)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs ls` ([#640](https://github.com/apify/apify-cli/pull/640)) ([dd84d37](https://github.com/apify/apify-cli/commit/dd84d37c6ea89c64db712c7c94709f3181a7bd1f)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs abort` ([#643](https://github.com/apify/apify-cli/pull/643)) ([96e5a34](https://github.com/apify/apify-cli/commit/96e5a3435cca08d87dc8d39659a7a6524f18be0e)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs resurrect` ([#644](https://github.com/apify/apify-cli/pull/644)) ([7dbf4fb](https://github.com/apify/apify-cli/commit/7dbf4fb06c657246563c1c64e76ad83f283ea275)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs log` ([#645](https://github.com/apify/apify-cli/pull/645)) ([dd6af5e](https://github.com/apify/apify-cli/commit/dd6af5ece79f4399fc5065483b650c71c61114cf)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs rm` &amp; `builds rm` &amp; `actors rm` ([#648](https://github.com/apify/apify-cli/pull/648)) ([566f8c5](https://github.com/apify/apify-cli/commit/566f8c5d1482f150f4d61229524c7672c2af666d)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs info` ([#657](https://github.com/apify/apify-cli/pull/657)) ([827767c](https://github.com/apify/apify-cli/commit/827767cfc988b7d587adceb825765e553deeed77)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors build` ([#661](https://github.com/apify/apify-cli/pull/661)) ([4605cda](https://github.com/apify/apify-cli/commit/4605cda7f3a4f5a35160ba69bf4a454c889dd813)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors pull` ([#662](https://github.com/apify/apify-cli/pull/662)) ([26d5cb3](https://github.com/apify/apify-cli/commit/26d5cb356fbb38a789e9b88f4d4b01468e38bd26)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors call` ([#663](https://github.com/apify/apify-cli/pull/663)) ([a472300](https://github.com/apify/apify-cli/commit/a4723007e65bde8db6eb121a0dc38e2c7bc6caec)) by [@vladfrangu](https://github.com/vladfrangu)
- Check if cli was installed using volta when checking for updates ([#667](https://github.com/apify/apify-cli/pull/667)) ([aee0233](https://github.com/apify/apify-cli/commit/aee023336768e59fd4ff8d6c957f804d315e7bf3)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors start` ([#669](https://github.com/apify/apify-cli/pull/669)) ([45956e2](https://github.com/apify/apify-cli/commit/45956e224305dd040b607d1fc3ff5cbbc8b28f32)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors push` ([#671](https://github.com/apify/apify-cli/pull/671)) ([d77c531](https://github.com/apify/apify-cli/commit/d77c5314d4252a6bbf30718436dd84467aa35d7f)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors ls` ([#675](https://github.com/apify/apify-cli/pull/675)) ([de258cb](https://github.com/apify/apify-cli/commit/de258cb8872857aa559afb4b16ed5a52f4fb2094)) by [@vladfrangu](https://github.com/vladfrangu)
- `key-value-stores get-value` ([#678](https://github.com/apify/apify-cli/pull/678)) ([67cfefe](https://github.com/apify/apify-cli/commit/67cfefef88fac220a1c959aaaecf3d051e482236)) by [@vladfrangu](https://github.com/vladfrangu)
- `datasets get-items` ([#679](https://github.com/apify/apify-cli/pull/679)) ([b521546](https://github.com/apify/apify-cli/commit/b521546df195bab7bedf5534167b6edae6a5e69e)) by [@vladfrangu](https://github.com/vladfrangu)
- `datasets` &#x2F; `key-value-stores` commands ([#685](https://github.com/apify/apify-cli/pull/685)) ([c7d77e1](https://github.com/apify/apify-cli/commit/c7d77e1cec711edd9996cbb1249e489fbf3db547)) by [@vladfrangu](https://github.com/vladfrangu)
- Key-value-store commands ([#700](https://github.com/apify/apify-cli/pull/700)) ([eb8ff3b](https://github.com/apify/apify-cli/commit/eb8ff3b9c7f1319d0937543f7b0b97cb25d6390a)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors info` ([#701](https://github.com/apify/apify-cli/pull/701)) ([0f4b3f0](https://github.com/apify/apify-cli/commit/0f4b3f08dd5937ca6664342c2510a9f4f3fa52f6)) by [@vladfrangu](https://github.com/vladfrangu)
- `datasets info` &#x2F; `key-value-stores info` ([#726](https://github.com/apify/apify-cli/pull/726)) ([56e8ffa](https://github.com/apify/apify-cli/commit/56e8ffaf7a7e03dcdd73e4e5472b106b31b0f543)) by [@vladfrangu](https://github.com/vladfrangu)
- Rewrite command descriptions ([#727](https://github.com/apify/apify-cli/pull/727)) ([3eb21d6](https://github.com/apify/apify-cli/commit/3eb21d6ab74ca66f59da2432aadcb40f7ea42440)) by [@TC-MO](https://github.com/TC-MO)

### 🐛 Bug Fixes

- Look for lowercase input schema in default paths ([#647](https://github.com/apify/apify-cli/pull/647)) ([68456e6](https://github.com/apify/apify-cli/commit/68456e63eee3c28e7c0ee7464a2cbc1a00ba9dfa)) by [@mvolfik](https://github.com/mvolfik)
- Emit warning if input.json is modified during run and prefilled with defaults ([#672](https://github.com/apify/apify-cli/pull/672)) ([8a6fd3f](https://github.com/apify/apify-cli/commit/8a6fd3f60523380041309db830a62f52cc60e4d4)) by [@vladfrangu](https://github.com/vladfrangu), closes [#670](https://github.com/apify/apify-cli/issues/670)
- Scrapy wrapping being broken due to ESM migration ([#686](https://github.com/apify/apify-cli/pull/686)) ([e2a7591](https://github.com/apify/apify-cli/commit/e2a7591070a284394643e8dbb03bc020939ff61f)) by [@vladfrangu](https://github.com/vladfrangu)
- **ci:** Make it work + publish with provenances ([#694](https://github.com/apify/apify-cli/pull/694)) ([e41ea72](https://github.com/apify/apify-cli/commit/e41ea728a9177dcec4ea73c25128cddebc00dd79)) by [@vladfrangu](https://github.com/vladfrangu)
- Handle stdin correctly from slower stdout emitting ([#704](https://github.com/apify/apify-cli/pull/704)) ([a5b53de](https://github.com/apify/apify-cli/commit/a5b53de480aad3caf80e1a9439cd5e64648fe312)) by [@vladfrangu](https://github.com/vladfrangu)
- Running commands with spaces on windows ([#715](https://github.com/apify/apify-cli/pull/715)) ([d1c207a](https://github.com/apify/apify-cli/commit/d1c207a703a6948e7b3a6cfe82c5cfa6a3b9222d)) by [@vladfrangu](https://github.com/vladfrangu), closes [#692](https://github.com/apify/apify-cli/issues/692)

## [0.21.0](https://github.com/apify/apify-cli/releases/tag/v0.21.0) (2025-01-16)

### 🚀 Features

- Builds namespace ([#620](https://github.com/apify/apify-cli/pull/620)) ([6345162](https://github.com/apify/apify-cli/commit/6345162e44a00b404b4f95c2c80c2e437eff1d62)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs ls` ([#640](https://github.com/apify/apify-cli/pull/640)) ([dd84d37](https://github.com/apify/apify-cli/commit/dd84d37c6ea89c64db712c7c94709f3181a7bd1f)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs abort` ([#643](https://github.com/apify/apify-cli/pull/643)) ([96e5a34](https://github.com/apify/apify-cli/commit/96e5a3435cca08d87dc8d39659a7a6524f18be0e)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs resurrect` ([#644](https://github.com/apify/apify-cli/pull/644)) ([7dbf4fb](https://github.com/apify/apify-cli/commit/7dbf4fb06c657246563c1c64e76ad83f283ea275)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs log` ([#645](https://github.com/apify/apify-cli/pull/645)) ([dd6af5e](https://github.com/apify/apify-cli/commit/dd6af5ece79f4399fc5065483b650c71c61114cf)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs rm` &amp; `builds rm` &amp; `actors rm` ([#648](https://github.com/apify/apify-cli/pull/648)) ([566f8c5](https://github.com/apify/apify-cli/commit/566f8c5d1482f150f4d61229524c7672c2af666d)) by [@vladfrangu](https://github.com/vladfrangu)
- `runs info` ([#657](https://github.com/apify/apify-cli/pull/657)) ([827767c](https://github.com/apify/apify-cli/commit/827767cfc988b7d587adceb825765e553deeed77)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors build` ([#661](https://github.com/apify/apify-cli/pull/661)) ([4605cda](https://github.com/apify/apify-cli/commit/4605cda7f3a4f5a35160ba69bf4a454c889dd813)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors pull` ([#662](https://github.com/apify/apify-cli/pull/662)) ([26d5cb3](https://github.com/apify/apify-cli/commit/26d5cb356fbb38a789e9b88f4d4b01468e38bd26)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors call` ([#663](https://github.com/apify/apify-cli/pull/663)) ([a472300](https://github.com/apify/apify-cli/commit/a4723007e65bde8db6eb121a0dc38e2c7bc6caec)) by [@vladfrangu](https://github.com/vladfrangu)
- Check if cli was installed using volta when checking for updates ([#667](https://github.com/apify/apify-cli/pull/667)) ([aee0233](https://github.com/apify/apify-cli/commit/aee023336768e59fd4ff8d6c957f804d315e7bf3)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors start` ([#669](https://github.com/apify/apify-cli/pull/669)) ([45956e2](https://github.com/apify/apify-cli/commit/45956e224305dd040b607d1fc3ff5cbbc8b28f32)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors push` ([#671](https://github.com/apify/apify-cli/pull/671)) ([d77c531](https://github.com/apify/apify-cli/commit/d77c5314d4252a6bbf30718436dd84467aa35d7f)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors ls` ([#675](https://github.com/apify/apify-cli/pull/675)) ([de258cb](https://github.com/apify/apify-cli/commit/de258cb8872857aa559afb4b16ed5a52f4fb2094)) by [@vladfrangu](https://github.com/vladfrangu)
- `key-value-stores get-value` ([#678](https://github.com/apify/apify-cli/pull/678)) ([67cfefe](https://github.com/apify/apify-cli/commit/67cfefef88fac220a1c959aaaecf3d051e482236)) by [@vladfrangu](https://github.com/vladfrangu)
- `datasets get-items` ([#679](https://github.com/apify/apify-cli/pull/679)) ([b521546](https://github.com/apify/apify-cli/commit/b521546df195bab7bedf5534167b6edae6a5e69e)) by [@vladfrangu](https://github.com/vladfrangu)
- `datasets` &#x2F; `key-value-stores` commands ([#685](https://github.com/apify/apify-cli/pull/685)) ([c7d77e1](https://github.com/apify/apify-cli/commit/c7d77e1cec711edd9996cbb1249e489fbf3db547)) by [@vladfrangu](https://github.com/vladfrangu)
- Key-value-store commands ([#700](https://github.com/apify/apify-cli/pull/700)) ([eb8ff3b](https://github.com/apify/apify-cli/commit/eb8ff3b9c7f1319d0937543f7b0b97cb25d6390a)) by [@vladfrangu](https://github.com/vladfrangu)
- `actors info` ([#701](https://github.com/apify/apify-cli/pull/701)) ([0f4b3f0](https://github.com/apify/apify-cli/commit/0f4b3f08dd5937ca6664342c2510a9f4f3fa52f6)) by [@vladfrangu](https://github.com/vladfrangu)
- `datasets info` &#x2F; `key-value-stores info` ([#726](https://github.com/apify/apify-cli/pull/726)) ([56e8ffa](https://github.com/apify/apify-cli/commit/56e8ffaf7a7e03dcdd73e4e5472b106b31b0f543)) by [@vladfrangu](https://github.com/vladfrangu)
- Rewrite command descriptions ([#727](https://github.com/apify/apify-cli/pull/727)) ([3eb21d6](https://github.com/apify/apify-cli/commit/3eb21d6ab74ca66f59da2432aadcb40f7ea42440)) by [@TC-MO](https://github.com/TC-MO)

### 🐛 Bug Fixes

- Look for lowercase input schema in default paths ([#647](https://github.com/apify/apify-cli/pull/647)) ([68456e6](https://github.com/apify/apify-cli/commit/68456e63eee3c28e7c0ee7464a2cbc1a00ba9dfa)) by [@mvolfik](https://github.com/mvolfik)
- Emit warning if input.json is modified during run and prefilled with defaults ([#672](https://github.com/apify/apify-cli/pull/672)) ([8a6fd3f](https://github.com/apify/apify-cli/commit/8a6fd3f60523380041309db830a62f52cc60e4d4)) by [@vladfrangu](https://github.com/vladfrangu), closes [#670](https://github.com/apify/apify-cli/issues/670)
- Scrapy wrapping being broken due to ESM migration ([#686](https://github.com/apify/apify-cli/pull/686)) ([e2a7591](https://github.com/apify/apify-cli/commit/e2a7591070a284394643e8dbb03bc020939ff61f)) by [@vladfrangu](https://github.com/vladfrangu)
- **ci:** Make it work + publish with provenances ([#694](https://github.com/apify/apify-cli/pull/694)) ([e41ea72](https://github.com/apify/apify-cli/commit/e41ea728a9177dcec4ea73c25128cddebc00dd79)) by [@vladfrangu](https://github.com/vladfrangu)
- Handle stdin correctly from slower stdout emitting ([#704](https://github.com/apify/apify-cli/pull/704)) ([a5b53de](https://github.com/apify/apify-cli/commit/a5b53de480aad3caf80e1a9439cd5e64648fe312)) by [@vladfrangu](https://github.com/vladfrangu)
- Running commands with spaces on windows ([#715](https://github.com/apify/apify-cli/pull/715)) ([d1c207a](https://github.com/apify/apify-cli/commit/d1c207a703a6948e7b3a6cfe82c5cfa6a3b9222d)) by [@vladfrangu](https://github.com/vladfrangu), closes [#692](https://github.com/apify/apify-cli/issues/692)

# 0.6.1 / 2020-05-18

- **BREAKING:** Templates are now fully decoupled from this project and
  the [templates repository](https://github.com/apify/actor-templates)
  serves as the single source of truth. Some templates were replaced
  and others were renamed to better clarify their purpose.
- **BREAKING:** Providing an invalid template in `apify.json` no longer
  throws, but rather silently uses a reasonable default configuration.
  This is to support regular changes to templates without breaking older
  versions of the CLI.

  # 0.5.3 / 2020-03-03

- Moved templates to separate repository
- Fixed: creating `apify_storage` in root folder after `apify create` command

  # 0.5.2 / 2020-01-22

- Added bot(dependabot.com) to check latest Apify SDK version in all templates
- Updated apify package in all templates
- Updated npm packages and fixed all npm audit issues

  # 0.5.1 / 2019-12-19

- Added warning about outdated node.js version
- Fixed infinite push, when the previous one was interrupted
- Fixed calling public actors with `apify call`
- `apify init` create empty INPUT.json file

  # 0.5.0 / 2019-11-27

- Drop support for node 8 and 9
- Fix: Pass the --max-http-header-size=80000 to the nodeJs process

  # 0.4.1 / 2019-10-02

- New actor template for Apify projects, you can create it with `apify create --template apify_project`
- `apify vis` - Using improved schema validator

  # 0.4.0 / 2019-09-23

- Breaking Change - `apify push`: Pushes source code as a "Multiple source files" in case source code is less that 3 MB

  # 0.3.12 / 2019-09-18

  Bug fixes:

- `apify create`: Added validation for actor name
- `apify init` skips creation of apify.json if already exists
- `apify run -p` runs actor, if apify_storage doesn't exist
- Updated packages
- Additional minor fixes

  # 0.3.11 / 2019-07-26

- Updated packages
- Updated Cheerio Crawler template
- Updated Apify package version in all templates

  # 0.3.10 / 2019-06-03

- Updated packages

  # 0.3.9 / 2019-05-15

- Improved the templates and texts

  # 0.3.8 / 2019-03-29

- Updated all templates regarding the last version of apify SDK.

  # 0.3.7 / 2019-03-18

- Fixed templates to use Apify.getInput(), replaced deprecated function and options,
  added debug fields, added .idea to .gitignore
- Updated packages
- Fixed bug: Users without username can use push/call command

  # 0.3.6 / 2019-01-29

- Added command `apify vis` that validates actor input schema.

  # 0.3.5 / 2019-01-25

- Upgraded to apify@0.11 in templates

  # 0.3.3 / 2018-12-12

- Omitted CMD command in all templates Dockerfile.

  # 0.3.2 / 2018-12-05

- Updated apify-client package. It fixed bug, when user can not push actor, whe he changed version in apify.json.

  # 0.3.1 / 2018-11-29

- :tada: New commands to manage secret environment variables: `apify secrets:add`, `apify secrets:rm`.
- New documentation how to set environment variable in `apify.json`, see [documentation](https://github.com/apify/apify-cli/blob/master/README.md#environment-variables).
- **BREAKING CHANGES**: Simplified `apify.json` structure. It will be updated automatically before execution apify run and push command.
- Command `apify create` now shows progress bar of npm install.
- Small bugs fixes

  # 0.2.7 / 2018-11-27

- Updated all templates to latest apify packages

  # 0.2.6 / 2018-11-09

- Added warning if `apify run` reuse old state in storage
- Fixed issues #70 #65 #68

  # 0.2.5 / 2018-10-31

- Updated NPM dependencies
- Upgraded to apify-shared@0.1.6
- Fixed templates to use apify/actor-node-chrome Docker image instead of outdated apify/actor-node-puppeteer

  # 0.2.3 / 2018-09-17

- Updated all templates to apify version 0.8.\*
- Added template named hello_word

  # 0.2.1 / 2018-09-17

- **BREAKING CHANGES**: The local storage directories have been renamed and package.json files needs a new `start` command.
  See [migration guide](/MIGRATIONS.md) for existing projects if you are upgrading from 0.1._ to 0.2._.
- You can specified another file that main.js for `apify run` command using npm start script.

  # 0.2.0 / 2018-09-12

- **BREAKING CHANGES**: Version 0.2.0 of Apify CLI supports only version 0.7.0 of API SDK or newer as management of environment variables
  has been changed according to Apify SDK version 0.7.0.
- Dropped support for Node 7

  # 0.1.18 / 2018-09-12

- Updated NPM dependencies, npm-shrinkwrap.json replaced with package-lock.json
- Updated NPM dependencies in code templates

  # 0.1.15 / 2018-07-23

- Rename act to actor

  # 0.1.13 / 2018-07-12

- Add environment variables for enable live view for local actors.

  # 0.1.12 / 2018-06-28

- From now `apify call` and `apify push` commands stream live logs from run and build to your terminal
- Add options -p, --purge, --purge-dataset, --purge-key-value-store, --purge-queue in `apify run` to clean stores before runs actor locally
- Add option -w, --wait-for-finish=wait-for-finish in `apify push` and `apify call` - command waits x seconds to finish run or build on Apify
- Fixes #26, #33, #34, #36, #38, #39, #37, #35

  # 0.1.11 / 2018-05-30

- Use npm-shrinkwrap.json instead of package-lock.json for published module
- Update template, where we using proxy
- Fix #30

  # 0.1.9 / 2018-04-18

- apify run takes APIFY_USER_ID and APIFY_TOKEN as environments variables, if client is logged locally
- apify call takes input from default local key-value-store
- Fix: duplicates new lines in log

  # 0.1.8 / 2018-04-17

- Print warning if you have old version of cli
- apify run - kills all sub processes for SIGINT signal (ctrl+c) - It kills all related browsers in apify run command, related issue:
  https://github.com/apify/apify-js/issues/72

  # 0.1.7 / 2018-04-12

- Readme and templates updates

  # 0.1.6 / 2018-04-11

- Add support for request queue

  # 0.1.5 / 2018-04-09

- Works for windows
- New command apify info

  # 0.1.x / 2018-04-01

- The first public release

  # 0.0.x / 2018-03-01

- Initial development, lot of new stuff
