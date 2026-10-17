import { Card, Descriptions } from 'antd'
import PageHeader from '../components/PageHeader'

export default function About() {
  return (
    <>
      <PageHeader
        title="O aplikacji"
        subtitle="Quiz pomaga uczyć się angielskich czasowników nieregularnych: kursy z lekcjami, losowe quizy i historia wyników."
      />
      <Card>
        <Descriptions column={1} bordered styles={{ label: { width: 180 } }}>
          <Descriptions.Item label="Frontend">React 19, Vite, TypeScript, React Router</Descriptions.Item>
          <Descriptions.Item label="UI">Ant Design 6</Descriptions.Item>
          <Descriptions.Item label="Stan i dane">Redux Toolkit, RTK Query</Descriptions.Item>
          <Descriptions.Item label="Backend">Express (Netlify Function), Netlify Database (Postgres)</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}
