# Dependencies

## Dependency tree
```sh
npm warn Expanding --prod to --production. This will stop working in the next major version of npm.
npm warn config production Use `--omit=dev` instead.
@decaf-ts/for-http@0.3.37 /home/tvenceslau/local-workspace/decaf-ts/for-http
├─┬ @decaf-ts/core@0.8.26
│ ├── @decaf-ts/db-decorators@0.8.16 deduped
│ ├── @decaf-ts/decoration@0.8.7 deduped
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped
│ ├── @decaf-ts/injectable-decorators@1.9.10 deduped
│ └── @decaf-ts/transactional-decorators@0.3.5 deduped
├─┬ @decaf-ts/db-decorators@0.8.16
│ ├── @decaf-ts/decoration@0.8.7 deduped
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped
│ ├── @decaf-ts/injectable-decorators@1.9.10 deduped
│ └── @decaf-ts/logging@0.10.8 deduped
├─┬ @decaf-ts/decoration@0.8.7
│ └── reflect-metadata@0.2.2
├─┬ @decaf-ts/decorator-validation@1.11.16
│ └── @decaf-ts/decoration@0.8.7 deduped
├─┬ @decaf-ts/injectable-decorators@1.9.10
│ └── @decaf-ts/decoration@0.8.7 deduped
├─┬ @decaf-ts/logging@0.10.8
│ ├─┬ pino@10.1.0
│ │ ├── @pinojs/redact@0.4.0
│ │ ├── atomic-sleep@1.0.0
│ │ ├── on-exit-leak-free@2.1.2
│ │ ├─┬ pino-abstract-transport@2.0.0
│ │ │ └── split2@4.2.0
│ │ ├── pino-std-serializers@7.0.0
│ │ ├── process-warning@5.0.0
│ │ ├── quick-format-unescaped@4.0.4
│ │ ├── real-require@0.2.0
│ │ ├── safe-stable-stringify@2.5.0
│ │ ├─┬ sonic-boom@4.2.0
│ │ │ └── atomic-sleep@1.0.0 deduped
│ │ └─┬ thread-stream@3.1.0
│ │   └── real-require@0.2.0 deduped
│ ├── styled-string-builder@1.5.1
│ ├── typed-object-accumulator@0.1.5
│ └─┬ winston@3.18.3
│   ├── @colors/colors@1.6.0
│   ├─┬ @dabh/diagnostics@2.0.8
│   │ ├─┬ @so-ric/colorspace@1.1.6
│   │ │ ├─┬ color@5.0.3
│   │ │ │ ├─┬ color-convert@3.1.3
│   │ │ │ │ └── color-name@2.1.0
│   │ │ │ └─┬ color-string@2.1.4
│   │ │ │   └── color-name@2.1.0
│   │ │ └── text-hex@1.0.0
│   │ ├── enabled@2.0.0
│   │ └── kuler@2.0.0
│   ├── async@3.2.6
│   ├── is-stream@2.0.1
│   ├─┬ logform@2.7.0
│   │ ├── @colors/colors@1.6.0 deduped
│   │ ├── @types/triple-beam@1.3.5
│   │ ├── fecha@4.2.3
│   │ ├── ms@2.1.3
│   │ ├── safe-stable-stringify@2.5.0 deduped
│   │ └── triple-beam@1.4.1 deduped
│   ├─┬ one-time@1.0.0
│   │ └── fn.name@1.1.0
│   ├─┬ readable-stream@3.6.2
│   │ ├── inherits@2.0.4
│   │ ├─┬ string_decoder@1.3.0
│   │ │ └── safe-buffer@5.2.1
│   │ └── util-deprecate@1.0.2
│   ├── safe-stable-stringify@2.5.0 deduped
│   ├── stack-trace@0.0.10
│   ├── triple-beam@1.4.1
│   └─┬ winston-transport@4.9.0
│     ├── logform@2.7.0 deduped
│     ├── readable-stream@3.6.2 deduped
│     └── triple-beam@1.4.1 deduped
├─┬ @decaf-ts/transactional-decorators@0.3.5
│ ├── @decaf-ts/db-decorators@0.8.16 deduped
│ ├── @decaf-ts/decoration@0.8.7 deduped
│ ├── @decaf-ts/decorator-validation@1.11.16 deduped
│ └── @decaf-ts/injectable-decorators@1.9.10 deduped
└─┬ axios@1.13.2
  ├── follow-redirects@1.15.11
  ├─┬ form-data@4.0.4
  │ ├── asynckit@0.4.0
  │ ├─┬ combined-stream@1.0.8
  │ │ └── delayed-stream@1.0.0
  │ ├─┬ es-set-tostringtag@2.1.0
  │ │ ├── es-errors@1.3.0
  │ │ ├─┬ get-intrinsic@1.3.0
  │ │ │ ├─┬ call-bind-apply-helpers@1.0.2
  │ │ │ │ ├── es-errors@1.3.0 deduped
  │ │ │ │ └── function-bind@1.1.2 deduped
  │ │ │ ├── es-define-property@1.0.1
  │ │ │ ├── es-errors@1.3.0 deduped
  │ │ │ ├─┬ es-object-atoms@1.1.1
  │ │ │ │ └── es-errors@1.3.0 deduped
  │ │ │ ├── function-bind@1.1.2 deduped
  │ │ │ ├─┬ get-proto@1.0.1
  │ │ │ │ ├─┬ dunder-proto@1.0.1
  │ │ │ │ │ ├── call-bind-apply-helpers@1.0.2 deduped
  │ │ │ │ │ ├── es-errors@1.3.0 deduped
  │ │ │ │ │ └── gopd@1.2.0 deduped
  │ │ │ │ └── es-object-atoms@1.1.1 deduped
  │ │ │ ├── gopd@1.2.0
  │ │ │ ├── has-symbols@1.1.0
  │ │ │ ├── hasown@2.0.2 deduped
  │ │ │ └── math-intrinsics@1.1.0
  │ │ ├─┬ has-tostringtag@1.0.2
  │ │ │ └── has-symbols@1.1.0 deduped
  │ │ └── hasown@2.0.2 deduped
  │ ├─┬ hasown@2.0.2
  │ │ └── function-bind@1.1.2
  │ └─┬ mime-types@2.1.35
  │   └── mime-db@1.52.0
  └── proxy-from-env@1.1.0
```
## Audit report
```sh
npm audit --production
npm warn config production Use `--omit=dev` instead.
found 0 vulnerabilities
```
