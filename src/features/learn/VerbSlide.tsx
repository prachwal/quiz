import { Card, Flex, Progress, Tag, Typography, theme } from 'antd'
import type { ReactNode } from 'react'
import { DifficultyTag, PopularityTag } from '../../components/GroupTags'
import SpeakButton from '../audio/SpeakButton'
import { MediaImage } from '../media/MediaImage'
import { verbSpeechParts } from '../audio/speech'
import type { IrregularVerb } from '../../shared/quiz/types'
import { PATTERN_HINTS, formsText } from './format'

function Form({ label, value, speak }: { label: string; value: string; speak: { key: string; parts: string[] } }) {
  const { token } = theme.useToken()
  return (
    <Flex
      vertical
      align="center"
      gap={6}
      className="verb-form"
      style={{
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: 'var(--app-shadow-sm)',
        minWidth: 0,
      }}
    >
      <Typography.Text
        type="secondary"
        style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2 }}
      >
        {label}
      </Typography.Text>
      <span
        lang="en"
        className="verb-form-value"
        style={{
          fontWeight: 700,
          lineHeight: 1.2,
          color: token.colorPrimary,
          textAlign: 'center',
        }}
      >
        {value}
      </span>
      <SpeakButton speakKey={speak.key} parts={speak.parts} label={`Odsłuchaj: ${value}`} />
    </Flex>
  )
}

/** One verb as a slide: group info on top, forms + Polish meaning + example below. */
export default function VerbSlide({
  verb,
  index,
  total,
  renderBadge,
}: {
  verb: IrregularVerb
  index: number
  total: number
  /** Optional extra tag next to the group tags, supplied by the route (e.g. the weak-verb mark). */
  renderBadge?: (verbId: number) => ReactNode
}) {
  const { token } = theme.useToken()
  return (
    <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
      <Flex vertical>
        <Flex
          justify="space-between"
          align="center"
          wrap
          gap="small"
          style={{ padding: '16px clamp(16px, 4vw, 28px) 12px' }}
        >
          <Flex wrap gap={6} align="center">
            <DifficultyTag value={verb.difficulty} />
            <PopularityTag value={verb.popularity} />
            <Tag title={PATTERN_HINTS[verb.pattern]}>{verb.pattern}</Tag>
            <Tag>{verb.cefrLevel}</Tag>
            {renderBadge?.(verb.id)}
          </Flex>
          <Typography.Text style={{ fontSize: 15, fontWeight: 600, color: token.colorTextSecondary }}>
            <span style={{ color: token.colorPrimary }}>{index + 1}</span> / {total}
          </Typography.Text>
        </Flex>
        <Progress
          percent={Math.round(((index + 1) / total) * 100)}
          showInfo={false}
          size={{ height: 4 }}
          strokeColor={{ from: token.colorPrimary, to: '#a855f7' }}
          railColor={token.colorFillSecondary}
          style={{ padding: '0 clamp(16px, 4vw, 28px)', margin: 0, lineHeight: 0 }}
        />

        <Flex
          vertical
          align="center"
          gap={20}
          className="verb-slide-body"
          style={{
            padding: 'clamp(28px, 5vw, 48px) clamp(16px, 4vw, 32px)',
            background: `radial-gradient(90% 70% at 50% 0%, ${token.colorPrimaryBg} 0%, transparent 70%)`,
          }}
        >
          <Flex vertical align="center" gap={6}>
            <h2
              lang="en"
              className="verb-base"
              style={{
                margin: 0,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: -1.5,
                color: token.colorTextHeading,
                textAlign: 'center',
              }}
            >
              {verb.base}
            </h2>
            <SpeakButton
              speakKey={`verb-${verb.id}-all`}
              parts={verbSpeechParts(verb)}
              label={`Odsłuchaj wszystkie formy: ${verb.base}`}
              size="large"
            />
            <span
              style={{
                fontSize: 'clamp(20px, 1.5vw + 14px, 24px)',
                lineHeight: 1.4,
                color: token.colorTextSecondary,
                textAlign: 'center',
              }}
            >
              {verb.meanings.join(', ')}
            </span>
          </Flex>

          {/* the illustration sits between the base form and the forms; the picture is stacked on every screen */}
          {verb.imageMediaId && (
            <div className="verb-illustration">
              <MediaImage mediaId={verb.imageMediaId} alt={verb.base} />
            </div>
          )}

          <div
            style={{
              width: '100%',
              maxWidth: 560,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
              gap: 12,
            }}
          >
            <Form
              label="Past simple"
              value={formsText(verb.pastSimple)}
              speak={{ key: `verb-${verb.id}-ps`, parts: verb.pastSimple }}
            />
            <Form
              label="Past participle"
              value={formsText(verb.pastParticiple)}
              speak={{ key: `verb-${verb.id}-pp`, parts: verb.pastParticiple }}
            />
          </div>
          {/* visible text instead of a hover-only tooltip (works on touch screens) */}
          <Typography.Text type="secondary" style={{ fontSize: 14, marginTop: -8, textAlign: 'center' }}>
            Wzorzec {verb.pattern}: {PATTERN_HINTS[verb.pattern].toLowerCase()}
          </Typography.Text>

          <Flex
            vertical
            gap={4}
            style={{
              width: '100%',
              maxWidth: 560,
              padding: '12px 18px',
              borderInlineStart: `3px solid ${token.colorPrimary}`,
              borderRadius: `0 ${token.borderRadius}px ${token.borderRadius}px 0`,
              background: token.colorFillQuaternary,
            }}
          >
            <Flex align="flex-start" gap={10}>
              <Typography.Text lang="en" italic style={{ fontSize: 18, lineHeight: 1.5, flex: 1 }}>
                „{verb.exampleEn}”
              </Typography.Text>
              <SpeakButton
                speakKey={`verb-${verb.id}-ex`}
                parts={[verb.exampleEn]}
                label="Odsłuchaj zdanie"
                size="small"
              />
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              {verb.examplePl}
            </Typography.Text>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  )
}
