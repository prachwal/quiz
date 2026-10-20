import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Flex, Form, Input, Modal, Skeleton, Tag, Typography, App as AntdApp } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage } from '../app/api'
import { useCreateClassMutation, useListClassesQuery } from '../features/classes/api'
import PageHeader from '../components/PageHeader'

export default function Classes() {
  const { data, error, isLoading } = useListClassesQuery()
  const [create, { isLoading: creating }] = useCreateClassMutation()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ name: string }>()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const submit = async (values: { name: string }) => {
    try {
      const created = await create(values).unwrap()
      setOpen(false)
      form.resetFields()
      navigate(`/classes/${created.id}`)
    } catch (e) {
      void message.error(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Nauczyciel"
        title="Klasy"
        subtitle="Załóż klasę, przekaż uczniom kod, przydzielaj kursy i quizy z terminami i śledź ich postępy."
        extra={
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Nowa klasa
          </Button>
        }
      />

      {error ? (
        <Alert type="error" showIcon title={errorMessage(error)} />
      ) : isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : data.length === 0 ? (
        <Empty description="Nie masz jeszcze klas">
          <Button type="primary" onClick={() => setOpen(true)}>
            Utwórz pierwszą klasę
          </Button>
        </Empty>
      ) : (
        <div className="quiz-grid">
          {data.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`}>
              <Card hoverable className="lift-card" style={{ height: '100%' }}>
                <Flex vertical gap={8}>
                  <Flex align="center" gap={8}>
                    <TeamOutlined style={{ fontSize: 20 }} />
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {c.name}
                    </Typography.Title>
                  </Flex>
                  <Flex gap={6} wrap>
                    <Tag>{c.memberCount} uczniów</Tag>
                    <Tag>{c.assignmentCount} zadań</Tag>
                    <Tag color="processing">kod {c.joinCode}</Tag>
                  </Flex>
                </Flex>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title="Nowa klasa"
        okText="Utwórz"
        cancelText="Anuluj"
        confirmLoading={creating}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="name"
            label="Nazwa klasy"
            rules={[{ required: true, whitespace: true, min: 2, message: 'Podaj nazwę (min. 2 znaki)' }]}
          >
            <Input maxLength={80} placeholder="np. 3A – angielski" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
