import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import './App.css'
import { auth, isFirestoreEnabled, recordsCollection, winnerDocumentRef } from './firebase'

const TOTAL_NUMBERS = 1000
const MIN_PURCHASE_VALUE = 170000

const initialForm = {
  fullName: '',
  idNumber: '',
  phone: '',
  email: '',
  purchaseValue: '',
  invoiceNumber: '',
  business: 'VALEJA',
}

const normalizeText = (value = '') => value.trim().replace(/\s+/g, ' ')

const normalizeInvoice = (value = '') => normalizeText(value).toUpperCase()

const parsePurchaseValue = (value) => {
  const cleanedValue = String(value).replace(/[.,\s]/g, '')

  if (!cleanedValue) {
    return null
  }

  const parsedValue = Number(cleanedValue)

  return Number.isFinite(parsedValue) ? parsedValue : null
}

const getAllNumbers = () =>
  Array.from({ length: TOTAL_NUMBERS }, (_, index) => String(index).padStart(3, '0'))

const normalizeRecord = (record) => ({
  ...record,
  id: record.id,
  purchaseValue: Number(record.purchaseValue || 0),
  createdAt: record.createdAt?.toDate
    ? record.createdAt.toDate().toISOString()
    : record.createdAt || new Date().toISOString(),
})

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

const formatDateTime = (value) => {
  if (!value) {
    return 'No disponible'
  }

  const dateValue = value?.toDate ? value.toDate() : new Date(value)

  if (Number.isNaN(dateValue?.getTime?.())) {
    return 'No disponible'
  }

  return dateValue.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function App() {
  const [formData, setFormData] = useState(initialForm)
  const [records, setRecords] = useState([])
  const [assignedNumber, setAssignedNumber] = useState(null)
  const [feedback, setFeedback] = useState({ type: 'info', message: '' })
  const [showLookup, setShowLookup] = useState(false)
  const [lookupType, setLookupType] = useState('idNumber')
  const [lookupValue, setLookupValue] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminSearch, setAdminSearch] = useState('')
  const [adminFeedback, setAdminFeedback] = useState({ type: 'info', message: '' })
  const [businessFilter, setBusinessFilter] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [visibleCount, setVisibleCount] = useState(10)
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinPreviewNumber, setSpinPreviewNumber] = useState(null)
  const [winnerRecord, setWinnerRecord] = useState(null)
  const [firebaseError, setFirebaseError] = useState('')
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsInitializing(false)
    }, 5000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!auth) {
      setIsAdminLoggedIn(false)
      setAuthLoading(false)
      setAdminFeedback({
        type: 'error',
        message: 'Firebase Authentication no está configurado. Agrega tus credenciales para habilitar el acceso administrativo.',
      })
      return undefined
    }

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        setIsAdminLoggedIn(Boolean(user))
        setAuthLoading(false)

        if (user) {
          setShowAdminLogin(false)
          return
        }

        setAdminFeedback({
          type: 'info',
          message: 'Inicia sesión con tu correo y contraseña para acceder al panel administrativo.',
        })
      },
      (error) => {
        console.error('Auth state changed failed', error)
        setAuthLoading(false)
        setAdminFeedback({
          type: 'error',
          message: 'No fue posible validar la sesión administrativa.',
        })
      },
    )

    return () => {
      unsubscribeAuth()
    }
  }, [])

  useEffect(() => {
    if (!isFirestoreEnabled || !recordsCollection) {
      setRecords([])
      setWinnerRecord(null)
      setFirebaseError('Firebase no está configurado. La interfaz sigue disponible, pero los registros en tiempo real no pueden cargarse.')
      setAdminFeedback({
        type: 'info',
        message: 'Firebase no está configurado. Agrega tus credenciales en .env para habilitar Firestore.',
      })
      setIsInitializing(false)
      return undefined
    }

    const unsubscribeRecords = onSnapshot(
      recordsCollection,
      (snapshot) => {
        const nextRecords = snapshot.docs.map((document) =>
          normalizeRecord({
            ...document.data(),
            id: document.id,
          }),
        )

        setRecords(nextRecords)
        setFirebaseError('')
      },
      (error) => {
        console.error('Firestore records snapshot failed', error)
        setFirebaseError('No fue posible sincronizar los registros con Firestore. La interfaz sigue visible y puedes seguir usando la app.')
        setAdminFeedback({
          type: 'error',
          message: 'No fue posible sincronizar los registros con Firestore.',
        })
        setIsInitializing(false)
      },
    )

    const unsubscribeWinner = onSnapshot(
      winnerDocumentRef,
      (snapshot) => {
        setWinnerRecord(snapshot.exists() ? normalizeRecord({ ...snapshot.data(), id: snapshot.id }) : null)
        setFirebaseError('')
      },
      (error) => {
        console.error('Firestore winner snapshot failed', error)
        setFirebaseError('No fue posible sincronizar el ganador con Firestore. La interfaz sigue visible y puedes seguir usando la app.')
        setAdminFeedback({
          type: 'error',
          message: 'No fue posible sincronizar el ganador con Firestore.',
        })
        setIsInitializing(false)
      },
    )

    return () => {
      unsubscribeRecords()
      unsubscribeWinner()
    }
  }, [])

  const usedNumbers = useMemo(
    () => records.map((record) => record.assignedNumber),
    [records],
  )

  const stats = useMemo(() => {
    const assigned = usedNumbers.length

    return {
      totalNumbers: TOTAL_NUMBERS,
      assigned,
      remaining: TOTAL_NUMBERS - assigned,
    }
  }, [usedNumbers])

  const salesStats = useMemo(() => {
    const totalSales = records.reduce(
      (sum, record) => sum + Number(record.purchaseValue || 0),
      0,
    )

    const byBusiness = records.reduce(
      (accumulator, record) => {
        accumulator[record.business] = (accumulator[record.business] || 0) + Number(record.purchaseValue || 0)
        return accumulator
      },
      {
        VALEJA: 0,
        UNIBELL: 0,
      },
    )

    return {
      totalSales,
      averageSale: records.length ? totalSales / records.length : 0,
      deliveredNumbers: records.length,
      byBusiness,
    }
  }, [records])

  const filteredRecords = useMemo(() => {
    const searchValue = adminSearch.trim().toLowerCase()

    return records.filter((record) => {
      const matchesFilter = businessFilter === 'all' || record.business === businessFilter

      if (!matchesFilter) {
        return false
      }

      if (!searchValue) {
        return true
      }

      return [
        record.fullName,
        record.idNumber,
        record.phone,
        record.email,
        record.invoiceNumber,
        record.assignedNumber,
        record.business,
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchValue)
    })
  }, [adminSearch, businessFilter, records])

  const sortedRecords = useMemo(() => {
    const nextRecords = [...filteredRecords]

    nextRecords.sort((left, right) => {
      const leftDate = new Date(left.createdAt).getTime()
      const rightDate = new Date(right.createdAt).getTime()

      if (sortBy === 'recent') {
        return rightDate - leftDate
      }

      if (sortBy === 'oldest') {
        return leftDate - rightDate
      }

      if (sortBy === 'highest') {
        return Number(right.purchaseValue) - Number(left.purchaseValue)
      }

      if (sortBy === 'lowest') {
        return Number(left.purchaseValue) - Number(right.purchaseValue)
      }

      return Number(left.assignedNumber || 0) - Number(right.assignedNumber || 0)
    })

    return nextRecords
  }, [filteredRecords, sortBy])

  const paginatedRecords = useMemo(
    () => sortedRecords.slice(0, visibleCount),
    [sortedRecords, visibleCount],
  )

  useEffect(() => {
    setVisibleCount(10)
  }, [adminSearch, businessFilter, sortBy])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  const clearForm = () => {
    setFormData(initialForm)
    setFeedback({ type: 'info', message: 'Formulario listo para registrar otro cliente.' })
  }

  const validateAndComposeRecord = (draft, existingId = null) => {
    const purchaseValue = parsePurchaseValue(draft.purchaseValue)
    const invoiceNumber = normalizeInvoice(draft.invoiceNumber)
    const idNumber = normalizeText(draft.idNumber)
    const fullName = normalizeText(draft.fullName)
    const phone = normalizeText(draft.phone)
    const email = normalizeText(draft.email)

    if (purchaseValue === null) {
      return { valid: false, message: 'Ingrese un valor de compra válido.' }
    }

    if (purchaseValue < MIN_PURCHASE_VALUE) {
      return {
        valid: false,
        message: `El valor de compra debe ser igual o superior a ${MIN_PURCHASE_VALUE.toLocaleString('es-CO')} COP.`,
      }
    }

    const duplicateInvoice = records.some(
      (record) =>
        record.invoiceNumber === invoiceNumber &&
        record.id !== existingId,
    )

    if (duplicateInvoice) {
      return {
        valid: false,
        message: 'La factura ya fue registrada. No se puede asignar el mismo número de factura dos veces.',
      }
    }

    const duplicateIdentity = records.some(
      (record) =>
        record.idNumber === idNumber &&
        record.invoiceNumber === invoiceNumber &&
        record.id !== existingId,
    )

    if (duplicateIdentity) {
      return {
        valid: false,
        message: 'Ya existe un registro con la misma identificación y la misma factura.',
      }
    }

    return {
      valid: true,
      record: {
        ...draft,
        fullName,
        idNumber,
        phone,
        email,
        purchaseValue,
        invoiceNumber,
        business: draft.business || 'VALEJA',
      },
    }
  }

  const handleAssign = async (event) => {
    event.preventDefault()

    const validated = validateAndComposeRecord(formData)

    if (!validated.valid) {
      setFeedback({ type: 'error', message: validated.message })
      return
    }

    const availableNumbers = getAllNumbers().filter(
      (number) => !usedNumbers.includes(number),
    )

    if (!availableNumbers.length) {
      setFeedback({
        type: 'error',
        message: 'No quedan números disponibles para asignar.',
      })
      return
    }

    const raffleIndex = Math.floor(Math.random() * availableNumbers.length)
    const raffleNumber = availableNumbers[raffleIndex]

    const newRecord = {
        ...validated.record,
          assignedNumber: raffleNumber,
            createdAt: serverTimestamp(),
            }

            if (!isFirestoreEnabled || !recordsCollection) {
              setFeedback({
                  type: 'error',
                      message: 'Firestore no está habilitado.',
                        })
                          return
                          }

                          try {
                            await addDoc(recordsCollection, newRecord)
                              setAssignedNumber(raffleNumber)

                                setFeedback({
                                    type: 'success',
                                        message: 'Registro exitoso. El cliente recibió el número asignado.',
                                          })

                                            setFormData(initialForm)
                                            } catch (error) {
                                              console.error(error)

                                                setFeedback({
                                                    type: 'error',
                                                        message: error?.message || 'No se pudo guardar el registro.',
                                                          })
                                                          }

                                                          const handleLookup = (event) => {
    }
    event.preventDefault()
    const normalizedLookupValue = normalizeText(lookupValue)

    if (!normalizedLookupValue) {
      setLookupResult(null)
      setFeedback({
        type: 'error',
        message: 'Ingrese un valor para consultar el número asignado.',
      })
      return
    }

    const searchValue =
      lookupType === 'assignedNumber'
        ? String(Number(normalizedLookupValue)).padStart(3, '0')
        : normalizedLookupValue

    const foundRecord = records.find((record) => {
      if (lookupType === 'idNumber') {
        return record.idNumber === searchValue
      }

      if (lookupType === 'invoiceNumber') {
        return record.invoiceNumber === searchValue.toUpperCase()
      }

      return record.assignedNumber === searchValue
    })

    if (!foundRecord) {
      setLookupResult(null)
      setFeedback({
        type: 'error',
        message: 'No se encontró ningún registro con la información consultada.',
      })
      return
    }

    setLookupResult(foundRecord)
    setFeedback({
      type: 'success',
      message: 'Consulta realizada correctamente.',
    })
  }

  const handleAdminLogin = async (event) => {
    event.preventDefault()

    if (!auth) {
      setAdminFeedback({
        type: 'error',
        message: 'Firebase Authentication no está disponible en esta configuración.',
      })
      return
    }

    const email = adminEmail.trim()
    const password = adminPassword.trim()

    if (!email || !password) {
      setAdminFeedback({
        type: 'error',
        message: 'Ingrese un correo y una contraseña válidos para continuar.',
      })
      return
    }

    try {
      setAuthLoading(true)
      await signInWithEmailAndPassword(auth, email, password)
      setAdminEmail('')
      setAdminPassword('')
      setShowAdminLogin(false)
      setAdminFeedback({
        type: 'success',
        message: 'Acceso autorizado al panel administrativo.',
      })
    } catch (error) {
      console.error('Admin sign-in failed', error)
      const translatedMessage =
        error?.code === 'auth/invalid-email'
          ? 'El correo electrónico no es válido.'
          : error?.code === 'auth/user-not-found'
            ? 'No existe una cuenta con este correo en Firebase Authentication.'
            : error?.code === 'auth/wrong-password'
              ? 'La contraseña es incorrecta.'
              : error?.code === 'auth/too-many-requests'
                ? 'Demasiados intentos. Intente nuevamente más tarde.'
                : 'No fue posible iniciar sesión en el panel administrativo.'

      setAdminFeedback({
        type: 'error',
        message: translatedMessage,
      })
    } finally {
      setAuthLoading(false)
    }
  }

  const handleAdminLogout = async () => {
    if (!auth) {
      setIsAdminLoggedIn(false)
      setShowAdminLogin(false)
      return
    }

    try {
      await signOut(auth)
      setIsAdminLoggedIn(false)
      setShowAdminLogin(false)
      setAdminPassword('')
      setAdminEmail('')
      setAdminFeedback({
        type: 'info',
        message: 'Sesión cerrada correctamente.',
      })
    } catch (error) {
      console.error('Admin sign-out failed', error)
      setAdminFeedback({
        type: 'error',
        message: 'No fue posible cerrar la sesión de Firebase Authentication.',
      })
    }
  }

  const handleDeleteRecord = async (recordId) => {
    const record = records.find((item) => item.id === recordId)

    if (!record) {
      setAdminFeedback({
        type: 'error',
        message: 'No se encontró el registro para eliminar.',
      })
      return
    }

    const shouldDelete = window.confirm(
      `¿Confirma eliminar a ${record.fullName} — factura ${record.invoiceNumber} — número ${record.assignedNumber}?`,
    )

    if (!shouldDelete) {
      return
    }

    if (!isFirestoreEnabled || !recordsCollection) {
      setAdminFeedback({
        type: 'error',
        message: 'Firestore no está habilitado para eliminar registros.',
      })
      return
    }

    try {
      await deleteDoc(doc(recordsCollection, recordId))
      setAdminFeedback({
        type: 'success',
        message: 'Registro eliminado correctamente.',
      })
    } catch (error) {
      console.error('Delete record failed', error)
      setAdminFeedback({
        type: 'error',
        message: error?.message || 'No se pudo eliminar el registro en Firestore.',
      })
    }
  }

  const startEdit = (record) => {
    setEditingRecordId(record.id)
    setEditDraft({
      fullName: record.fullName,
      idNumber: record.idNumber,
      phone: record.phone,
      email: record.email,
      purchaseValue: record.purchaseValue,
      invoiceNumber: record.invoiceNumber,
      business: record.business,
    })
  }

  const saveEdit = async (event) => {
    event.preventDefault()

    const sanitizedDraft = {
      ...editDraft,
      purchaseValue: editDraft.purchaseValue,
    }

    const validated = validateAndComposeRecord(sanitizedDraft, editingRecordId)

    if (!validated.valid) {
      setAdminFeedback({ type: 'error', message: validated.message })
      return
    }

    if (!isFirestoreEnabled || !recordsCollection) {
      setAdminFeedback({
        type: 'error',
        message: 'Firestore no está habilitado para actualizar registros.',
      })
      return
    }

    try {
      await updateDoc(doc(recordsCollection, editingRecordId), {
        ...validated.record,
        updatedAt: serverTimestamp(),
      })

      setEditingRecordId(null)
      setEditDraft(null)
      setAdminFeedback({
        type: 'success',
        message: 'Registro actualizado correctamente.',
      })
    } catch (error) {
      console.error('Update record failed', error)
      setAdminFeedback({
        type: 'error',
        message: error?.message || 'No se pudo actualizar el registro en Firestore.',
      })
    }
  }

  const exportToExcel = () => {
    if (!records.length) {
      setAdminFeedback({
        type: 'error',
        message: 'No hay registros para exportar.',
      })
      return
    }

    const exportData = records.map((record) => ({
      'Nombre completo': record.fullName,
      'Número de identificación': record.idNumber,
      'Teléfono': record.phone,
      'Correo electrónico': record.email || 'No registrado',
      'Negocio': record.business,
      'Número de factura': record.invoiceNumber,
      'Valor de compra': record.purchaseValue,
      'Número asignado': record.assignedNumber,
      'Fecha registro': record.createdAt
        ? new Date(record.createdAt).toLocaleString('es-CO')
        : 'No disponible',
    }))

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registros')
    XLSX.writeFile(workbook, 'valeja-unibell-registros.xlsx')
    setAdminFeedback({
      type: 'success',
      message: 'Archivo Excel descargado correctamente.',
    })
  }

  const startFinalRaffle = async () => {
    if (!records.length) {
      setAdminFeedback({
        type: 'error',
        message: 'No hay registros para realizar el sorteo.',
      })
      return
    }

    if (winnerRecord) {
      setAdminFeedback({
        type: 'error',
        message: 'El sorteo ya fue realizado y el ganador está guardado.',
      })
      return
    }

    if (isSpinning) {
      return
    }

    const eligibleRecords = [...records]
    const selectedRecord = eligibleRecords[Math.floor(Math.random() * eligibleRecords.length)]

    setIsSpinning(true)
    setSpinPreviewNumber(selectedRecord.assignedNumber)
    setAdminFeedback({ type: 'info', message: 'Sorteo en curso...' })

    let spinRounds = 0
    const spinInterval = window.setInterval(() => {
      spinRounds += 1
      const randomRecord = eligibleRecords[Math.floor(Math.random() * eligibleRecords.length)]
      setSpinPreviewNumber(randomRecord.assignedNumber)

      if (spinRounds >= 18) {
        window.clearInterval(spinInterval)
        setIsSpinning(false)
        setSpinPreviewNumber(selectedRecord.assignedNumber)
        setAdminFeedback({
          type: 'success',
          message: `¡Sorteo finalizado! El ganador es ${selectedRecord.fullName}.`,
        })

        if (isFirestoreEnabled && winnerDocumentRef) {
          setDoc(winnerDocumentRef, {
            ...selectedRecord,
            winnerAt: serverTimestamp(),
          }).catch(() => {
            setAdminFeedback({
              type: 'error',
              message: 'No se pudo guardar el ganador en Firestore.',
            })
          })
        }
      }
    }, 150)
  }

  const resetFinalRaffle = async () => {
    const shouldReset = window.confirm('¿Confirma reiniciar el sorteo final?')

    if (!shouldReset) {
      return
    }

    if (isFirestoreEnabled && winnerDocumentRef) {
      try {
        await deleteDoc(winnerDocumentRef)
      } catch {
        setAdminFeedback({
          type: 'error',
          message: 'No se pudo reiniciar el sorteo en Firestore.',
        })
        return
      }
    }

    setSpinPreviewNumber(null)
    setAdminFeedback({
      type: 'success',
      message: 'Sorteo reiniciado correctamente.',
    })
  }

  return (
    <main className="app">
      {isInitializing ? (
        <div className="feedback info" aria-live="polite">
          Cargando la aplicación y sincronizando datos…
        </div>
      ) : null}

      {firebaseError ? (
        <div className="feedback error" aria-live="polite">
          {firebaseError}
        </div>
      ) : null}

      <section className="hero">
        <div className="logos">
            <div className="logo-card logo-card-dark">
      <img
        src={`${import.meta.env.BASE_URL}valeja.png`}
          alt="Logo VALEJA Café Bar"
          />
          
          <img
            src={`${import.meta.env.BASE_URL}unibell.png`}
              alt="Logo UNIBELL"
              />
                                                          </div>
                                                          </div>

        <p className="eyebrow">PROMOCIÓN ESPECIAL</p>

        <h1>
          VALEJA <span>×</span> UNIBELL
        </h1>

        <p className="subtitle">
          Compra desde $170.000 y recibe un número para participar en nuestro gran sorteo.
        </p>

        <div className="stats">
          <article>
            <strong>{stats.totalNumbers}</strong>
            <span>Total de números</span>
          </article>

          <article>
            <strong>{stats.assigned}</strong>
            <span>Números asignados</span>
          </article>

          <article>
            <strong>{stats.remaining}</strong>
            <span>Números restantes</span>
          </article>
        </div>
<div className="qr-card">
    <h3>📲 Escanea para registrar tu compra</h3>
      <img
        src="/valeja-unibell-promos/qr.png"
          alt="Código QR"
            className="qr-image"
            />
                    </div>
        <div className="actions">
          <a className="primary" href="#register">
            Registrar cliente
          </a>
          <button className="secondary" type="button" onClick={() => setShowLookup(true)}>
            Consultar número
          </button>
          <button className="secondary" type="button" onClick={() => setShowAdminLogin(true)}>
            Panel admin
          </button>
        </div>
      </section>

      <section className="register-section" id="register">
        <div className="section-heading">
          <p className="eyebrow">REGISTRO</p>
          <h2>Asignación de número de rifa</h2>
        </div>

        <form className="registration-card" onSubmit={handleAssign}>
          <div className="field-grid">
            <label className="field">
              <span>Nombre completo</span>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Ingrese su nombre completo"
                required
              />
            </label>

            <label className="field">
              <span>Número de identificación</span>
              <input
                type="text"
                name="idNumber"
                value={formData.idNumber}
                onChange={handleChange}
                placeholder="Número de identificación"
                required
              />
            </label>

            <label className="field">
              <span>Teléfono</span>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Número de celular"
                required
              />
            </label>

            <label className="field">
              <span>Correo electrónico</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Correo electrónico (opcional)"
              />
            </label>

            <label className="field">
              <span>Valor de compra</span>
              <input
                type="text"
                inputMode="numeric"
                name="purchaseValue"
                value={formData.purchaseValue}
                onChange={handleChange}
                placeholder="Ej. 180.000 o 180000"
                required
              />
            </label>

            <label className="field">
              <span>Negocio de la compra</span>
              <select
                name="business"
                value={formData.business}
                onChange={handleChange}
                required
              >
                <option value="VALEJA">VALEJA</option>
                <option value="UNIBELL">UNIBELL</option>
              </select>
            </label>

            <label className="field field-full">
              <span>Número de factura</span>
              <input
                type="text"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleChange}
                placeholder="Número de factura"
                required
              />
            </label>
          </div>

          {feedback.message ? (
            <div className={`feedback ${feedback.type}`} aria-live="polite">
              {feedback.message}
            </div>
          ) : null}

          <div className="form-footer">
            <button className="primary" type="submit">
              Registrar cliente
            </button>

            <button className="secondary" type="button" onClick={clearForm}>
              Registrar otro cliente
            </button>

            {assignedNumber ? (
              <div className="assigned-card" aria-live="polite">
                <span>Número asignado</span>
                <strong>{assignedNumber}</strong>
              </div>
            ) : null}
          </div>
        </form>
      </section>

      
      
{showLookup ? (
  <div
    role="dialog"
    aria-modal="true"
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#111',
        color: '#fff',
        border: '2px solid #e7ae30',
        borderRadius: '20px',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Consultar número</h3>
        <button
          type="button"
          onClick={() => {
            setShowLookup(false)
            setLookupResult(null)
            setLookupFeedback({ type: 'info', message: '' })
          }}
        >
          ×
        </button>
      </div>

      <form onSubmit={handleLookup} style={{ display: 'grid', gap: '16px' }}>
        <label>
          <span>Buscar por</span>
          <select
            value={lookupType}
            onChange={(event) => {
              setLookupType(event.target.value)
              setLookupValue('')
              setLookupResult(null)
              setLookupFeedback({ type: 'info', message: '' })
            }}
          >
            <option value="idNumber">Número de identificación</option>
            <option value="invoiceNumber">Número de factura</option>
            <option value="assignedNumber">Número asignado</option>
          </select>
        </label>

        <label>
          <span>Valor a consultar</span>
          <input
            type="text"
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            placeholder="Ingrese la información"
            required
          />
        </label>

        <button className="primary" type="submit">
          Buscar
        </button>
      </form>

      {lookupFeedback.message ? (
        <div className={`feedback ${lookupFeedback.type}`}>
          {lookupFeedback.message}
        </div>
      ) : null}

      {lookupResult ? (
        <div className="lookup-result">
          <h4>Resultado encontrado</h4>
          <p><strong>Nombre:</strong> {lookupResult.fullName || 'No disponible'}</p>
          <p><strong>Identificación:</strong> {lookupResult.idNumber || 'No disponible'}</p>
          <p><strong>Teléfono:</strong> {lookupResult.phone || 'No disponible'}</p>
          <p><strong>Factura:</strong> {lookupResult.invoiceNumber || 'No disponible'}</p>
          <p><strong>Número asignado:</strong> {lookupResult.assignedNumber || 'No disponible'}</p>
        </div>
      ) : null}
    </div>
  </div>
) : null}

{showAdminLogin ? (
        <div className="lookup-modal" role="dialog" aria-modal="true">
          <div className="lookup-card">
            <div className="lookup-header">
              <h3>Panel administrativo</h3>
              <button type="button" className="close-button" onClick={() => setShowAdminLogin(false)}>
                ×
              </button>
            </div>

            <form className="lookup-form" onSubmit={handleAdminLogin}>
              <label className="field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="Ingrese su correo"
                  required
                />
              </label>

              <label className="field">
                <span>Contraseña</span>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Ingrese su contraseña"
                  required
                />
              </label>

              <button className="primary" type="submit" disabled={authLoading}>
                {authLoading ? 'Validando sesión...' : 'Entrar'}
              </button>
            </form>

            {adminFeedback.message ? (
              <div className={`feedback ${adminFeedback.type}`}>{adminFeedback.message}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAdminLoggedIn ? (
        <section className="admin-section" id="admin-panel">
          <div className="section-heading">
            <p className="eyebrow">ADMINISTRACIÓN</p>
            <h2>Panel de control</h2>
          </div>

          <div className="admin-dashboard">
            <article className="admin-stat-card">
              <span>Total de participantes</span>
              <strong>{records.length}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Total vendido</span>
              <strong>{formatCurrency(salesStats.totalSales)} COP</strong>
            </article>
            <article className="admin-stat-card">
              <span>Promedio de compra</span>
              <strong>{formatCurrency(salesStats.averageSale)} COP</strong>
            </article>
            <article className="admin-stat-card">
              <span>Números asignados</span>
              <strong>{stats.assigned}</strong>
            </article>
            <article className="admin-stat-card">
              <span>Números restantes</span>
              <strong>{stats.remaining}</strong>
            </article>
            <article className="admin-stat-card shipping-card">
              <span>Ventas de VALEJA</span>
              <strong>{formatCurrency(salesStats.byBusiness.VALEJA)} COP</strong>
            </article>
            <article className="admin-stat-card shipping-card">
              <span>Ventas de UNIBELL</span>
              <strong>{formatCurrency(salesStats.byBusiness.UNIBELL)} COP</strong>
            </article>
          </div>

          <div className="admin-toolbar">
            <input
              type="text"
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
              placeholder="Buscar por nombre, identificación, teléfono, factura o número asignado"
            />
            <select
              value={businessFilter}
              onChange={(event) => setBusinessFilter(event.target.value)}
              aria-label="Filtrar por negocio"
            >
              <option value="all">Todos</option>
              <option value="VALEJA">VALEJA</option>
              <option value="UNIBELL">UNIBELL</option>
            </select>
          </div>

          <div className="admin-toolbar admin-toolbar-actions">
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              aria-label="Ordenar registros"
            >
              <option value="recent">Fecha más reciente</option>
              <option value="oldest">Fecha más antigua</option>
              <option value="highest">Mayor compra</option>
              <option value="lowest">Menor compra</option>
              <option value="number">Número asignado</option>
            </select>
            <button type="button" className="secondary" onClick={() => setAdminSearch('')}>Limpiar búsqueda</button>
          </div>

          <div className="admin-toolbar admin-toolbar-actions">
            <button type="button" className="primary" onClick={exportToExcel}>
              Exportar a Excel
            </button>
            <button type="button" className="secondary" onClick={handleAdminLogout}>
              Cerrar sesión
            </button>
          </div>

          <div className="raffle-actions">
            <button
              type="button"
              className="primary"
              onClick={startFinalRaffle}
              disabled={isSpinning || Boolean(winnerRecord)}
            >
              {winnerRecord ? 'Sorteo realizado' : 'Realizar sorteo'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={resetFinalRaffle}
              disabled={!winnerRecord}
            >
              Reiniciar sorteo
            </button>
          </div>

          {adminFeedback.message ? (
            <div className={`feedback ${adminFeedback.type}`}>{adminFeedback.message}</div>
          ) : null}

          <div className="raffle-display">
            <div className={`raffle-wheel ${isSpinning ? 'spinning' : ''}`}>
              <div className="wheel-needle" />
              <div className="wheel-disc">
                <span>{spinPreviewNumber || '000'}</span>
              </div>
            </div>

            {winnerRecord ? (
              <div className="winner-card">
                <p className="eyebrow">GANADOR</p>
                <h3>{winnerRecord.fullName}</h3>
                <ul>
                  <li><strong>Identificación:</strong> {winnerRecord.idNumber}</li>
                  <li><strong>Teléfono:</strong> {winnerRecord.phone}</li>
                  <li><strong>Factura:</strong> {winnerRecord.invoiceNumber}</li>
                  <li><strong>Valor de compra:</strong> {winnerRecord.purchaseValue.toLocaleString('es-CO')} COP</li>
                  <li><strong>Número asignado:</strong> {winnerRecord.assignedNumber}</li>
                </ul>
              </div>
            ) : null}
          </div>

          <div className="table-wrap">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Identificación</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Negocio</th>
                  <th>Compra</th>
                  <th>Factura</th>
                  <th>Número</th>
                  <th>Fecha de registro</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Nombre">{record.fullName}</td>
                    <td data-label="Identificación">{record.idNumber}</td>
                    <td data-label="Teléfono">{record.phone}</td>
                    <td data-label="Correo">{record.email || 'No registrado'}</td>
                    <td data-label="Negocio">{record.business}</td>
                    <td data-label="Compra">{formatCurrency(record.purchaseValue)} COP</td>
                    <td data-label="Factura">{record.invoiceNumber}</td>
                    <td data-label="Número asignado">{record.assignedNumber}</td>
                    <td data-label="Fecha de registro">{formatDateTime(record.createdAt)}</td>
                    <td data-label="Acciones" className="actions-cell">
                      <button type="button" className="secondary small-btn" onClick={() => startEdit(record)}>
                        Editar
                      </button>
                      <button type="button" className="close-button small-btn" onClick={() => handleDeleteRecord(record.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleCount < sortedRecords.length ? (
            <div className="admin-toolbar admin-toolbar-actions">
              <button type="button" className="primary" onClick={() => setVisibleCount((current) => current + 10)}>
                Ver más
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {editingRecordId ? (
        <div className="lookup-modal" role="dialog" aria-modal="true">
          <div className="lookup-card">
            <div className="lookup-header">
              <h3>Editar registro</h3>
              <button type="button" className="close-button" onClick={() => setEditingRecordId(null)}>
                ×
              </button>
            </div>

            <form className="lookup-form" onSubmit={saveEdit}>
              <label className="field">
                <span>Nombre completo</span>
                <input
                  type="text"
                  value={editDraft.fullName}
                  onChange={(event) => setEditDraft({ ...editDraft, fullName: event.target.value })}
                  required
                />
              </label>

              <label className="field">
                <span>Identificación</span>
                <input
                  type="text"
                  value={editDraft.idNumber}
                  onChange={(event) => setEditDraft({ ...editDraft, idNumber: event.target.value })}
                  required
                />
              </label>

              <label className="field">
                <span>Teléfono</span>
                <input
                  type="text"
                  value={editDraft.phone}
                  onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })}
                  required
                />
              </label>

              <label className="field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={editDraft.email}
                  onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Valor de compra</span>
                <input
                  type="text"
                  value={editDraft.purchaseValue}
                  onChange={(event) => setEditDraft({ ...editDraft, purchaseValue: event.target.value })}
                  required
                />
              </label>

              <label className="field">
                <span>Negocio</span>
                <select
                  value={editDraft.business}
                  onChange={(event) => setEditDraft({ ...editDraft, business: event.target.value })}
                >
                  <option value="VALEJA">VALEJA</option>
                  <option value="UNIBELL">UNIBELL</option>
                </select>
              </label>

              <label className="field field-full">
                <span>Número de factura</span>
                <input
                  type="text"
                  value={editDraft.invoiceNumber}
                  onChange={(event) => setEditDraft({ ...editDraft, invoiceNumber: event.target.value })}
                  required
                />
              </label>

              <button className="primary" type="submit">
                Guardar cambios
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <section className="info">
        <h2>Participa y gana</h2>

        <div className="steps">
          <article>
            <span>1</span>
            <h3>Realiza tu compra</h3>
            <p>Compra productos participantes por un valor desde $170.000.</p>
          </article>

          <article>
            <span>2</span>
            <h3>Registra tus datos</h3>
            <p>Presenta tu factura y registra tus datos personales.</p>
          </article>

          <article>
            <span>3</span>
            <h3>Recibe tu número</h3>
            <p>Obtendrás un número único entre el 000 y el 999.</p>
          </article>
        </div>
      </section>
    </main>
  )
}

export default App